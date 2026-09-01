"use client";

import { ProductState } from "@/components/luminax/ProductState";
import { AssistantPanel } from "@/components/luminax/workbench/AssistantPanel";
import { InsightCanvas } from "@/components/luminax/workbench/InsightCanvas";
import { ScopeBar } from "@/components/luminax/workbench/ScopeBar";
import { WorkbenchHeader } from "@/components/luminax/workbench/WorkbenchHeader";
import { WorkbenchShell } from "@/components/luminax/workbench/WorkbenchShell";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useLuminaXController } from "@/hooks/use-luminax-controller";
import { useLatestInsight } from "@/hooks/use-latest-insight";
import { useWorkbenchContext } from "@/hooks/use-workbench-context";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import {
  getSuggestedQuestions,
  getWorkbenchPresentationProfile,
} from "@/modules/workbench/workbench-presentation";

export function LuminaXApp({ user }: { user: AuthenticatedUser }) {
  const workbench = useWorkbenchContext();
  const controller = useLuminaXController(workbench.context);
  const latestInsight = useLatestInsight();
  const chat = useChatStream({
    onIntentMetadata: controller.applyIntentMetadata,
    onInsightEvent: async (event) => {
      const snapshot = await latestInsight.handleStreamEvent(event);
      if (event.status === "updated" && snapshot) {
        controller.applyInsightScope(snapshot.scope);
        controller.setInsightView("analysis");
      }
    },
  });

  if (workbench.isLoading || (workbench.context && controller.loading)) {
    return <WorkbenchLoadingState />;
  }
  if (!workbench.context || workbench.error) {
    return (
      <WorkbenchErrorState
        message={workbench.error}
        onRetry={workbench.reload}
      />
    );
  }
  if (controller.error || !controller.salesData) {
    return (
      <WorkbenchErrorState
        message={controller.error}
        onRetry={controller.reload}
      />
    );
  }

  const suggestions = getSuggestedQuestions(workbench.context);
  const presentationProfile = getWorkbenchPresentationProfile(
    workbench.context.templateId
  );
  return (
    <WorkbenchShell
      header={<WorkbenchHeader user={user} context={workbench.context} />}
      scopeBar={
        <ScopeBar
          stores={controller.authorizedStores}
          availableMetricCodes={workbench.context.availableMetricCodes}
          selectedStore={controller.selectedStore}
          compareStores={controller.compareStores}
          startDate={controller.startDate}
          endDate={controller.endDate}
          onSelectedStoreChange={controller.setSelectedStore}
          onCompareStoresChange={controller.setCompareStores}
          onStartDateChange={controller.setStartDate}
          onEndDateChange={controller.setEndDate}
        />
      }
      dataPanel={
        <InsightCanvas
          view={controller.insightView}
          templateId={workbench.context.templateId}
          presentationProfile={presentationProfile}
          availableMetricCodes={workbench.context.availableMetricCodes}
          dataSummary={controller.dataSummary}
          chartOptions={controller.chartOptions}
          reportHTML={controller.reportHTML}
          insight={latestInsight.insight}
          insightLoading={latestInsight.isLoading}
          insightError={latestInsight.error}
          insightGenerationStatus={latestInsight.generationStatus}
          pendingInsightActionIds={latestInsight.pendingActionIds}
          activeInsightScope={controller.activeInsightScope}
          suggestions={suggestions}
          onAskQuestion={chat.sendMessage}
          onApplyInsightScope={controller.applyInsightScope}
          onToggleInsightAction={latestInsight.toggleAction}
          onViewChange={controller.setInsightView}
        />
      }
      assistantPanel={
        <AssistantPanel
          messages={chat.messages}
          inputValue={chat.inputValue}
          isStreaming={chat.isStreaming}
          status={chat.status}
          suggestions={suggestions}
          chatAreaRef={chat.chatAreaRef}
          onInputChange={chat.setInputValue}
          onSendMessage={chat.sendMessage}
        />
      }
    />
  );
}

export function WorkbenchLoadingState() {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--luminax-canvas)]">
      <ProductState
        kind="loading"
        title="正在加载工作台..."
        description="正在准备已授权的经营数据"
      />
    </div>
  );
}

export function WorkbenchErrorState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry(): void;
}) {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--luminax-canvas)] p-6">
      <ProductState
        kind="error"
        title="工作台暂时不可用"
        description={message ?? "请稍后重试"}
        action={
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-[var(--luminax-yellow)] px-4 py-2 text-sm font-semibold text-[var(--luminax-ink)] transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            重新加载
          </button>
        }
      />
    </div>
  );
}

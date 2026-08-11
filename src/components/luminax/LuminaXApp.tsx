"use client";

import { AlertTriangle } from "lucide-react";
import { AssistantPanel } from "@/components/luminax/workbench/AssistantPanel";
import { InsightCanvas } from "@/components/luminax/workbench/InsightCanvas";
import { ScopeBar } from "@/components/luminax/workbench/ScopeBar";
import { WorkbenchHeader } from "@/components/luminax/workbench/WorkbenchHeader";
import { WorkbenchShell } from "@/components/luminax/workbench/WorkbenchShell";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useLuminaXController } from "@/hooks/use-luminax-controller";
import { useWorkbenchContext } from "@/hooks/use-workbench-context";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { getSuggestedQuestions } from "@/modules/workbench/workbench-presentation";

export function LuminaXApp({ user }: { user: AuthenticatedUser }) {
  const workbench = useWorkbenchContext();
  const controller = useLuminaXController(workbench.context);
  const chat = useChatStream({
    onIntentMetadata: controller.applyIntentMetadata,
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
  const latestAssistantMessage = [...chat.messages]
    .reverse()
    .find((message) => message.role === "ai");

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
          availableMetricCodes={workbench.context.availableMetricCodes}
          dataSummary={controller.dataSummary}
          chartOptions={controller.chartOptions}
          reportHTML={controller.reportHTML}
          analysisContent={latestAssistantMessage?.content ?? ""}
          isAnalyzing={chat.isStreaming}
          onViewChange={controller.setInsightView}
        />
      }
      assistantPanel={
        <AssistantPanel
          messages={chat.messages}
          inputValue={chat.inputValue}
          isStreaming={chat.isStreaming}
          suggestions={suggestions}
          chatAreaRef={chat.chatAreaRef}
          onInputChange={chat.setInputValue}
          onSendMessage={chat.sendMessage}
        />
      }
    />
  );
}

function WorkbenchLoadingState() {
  return (
    <div className="grid h-dvh place-items-center bg-[#f5f6f7]">
      <div className="text-center">
        <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-4 border-[#FFE600] border-t-[#17181a]" />
        <p className="text-sm text-[#666a73]">正在加载工作台...</p>
      </div>
    </div>
  );
}

function WorkbenchErrorState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry(): void;
}) {
  return (
    <div className="grid h-dvh place-items-center bg-[#f5f6f7] p-6">
      <div className="max-w-sm text-center">
        <AlertTriangle className="mx-auto mb-3 size-6 text-red-600" />
        <p className="text-sm text-[#44474d]">
          {message ?? "工作台暂时不可用"}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-[8px] bg-[#FFE600] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#ead300] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          重新加载
        </button>
      </div>
    </div>
  );
}

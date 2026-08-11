"use client";

import { AppHeader } from "@/components/luminax/AppHeader";
import { ChatPanel } from "@/components/luminax/ChatPanel";
import { DashboardPanel } from "@/components/luminax/DashboardPanel";
import { ReportPanel } from "@/components/luminax/ReportPanel";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useLuminaXController } from "@/hooks/use-luminax-controller";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";

export function LuminaXApp({ user }: { user: AuthenticatedUser }) {
  const controller = useLuminaXController();
  const chat = useChatStream({
    onIntentMetadata: controller.applyIntentMetadata,
  });

  if (controller.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-[#FFE600] border-t-transparent" />
          <p className="text-muted-foreground">正在加载数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader
        user={user}
        viewMode={controller.viewMode}
        onBackToChat={() => controller.setViewMode("chat")}
      />

      <div className="flex flex-1 overflow-hidden">
        {controller.viewMode === "report" && (
          <ReportPanel reportHTML={controller.reportHTML} />
        )}

        {controller.viewMode === "dashboard" && (
          <DashboardPanel
            salesData={controller.salesData}
            dataSummary={controller.dataSummary}
            selectedStore={controller.selectedStore}
            startDate={controller.startDate}
            endDate={controller.endDate}
            compareStores={controller.compareStores}
            chartOptions={controller.chartOptions}
            onSelectedStoreChange={controller.setSelectedStore}
            onStartDateChange={controller.setStartDate}
            onEndDateChange={controller.setEndDate}
            onCompareStoresChange={controller.setCompareStores}
          />
        )}

        <ChatPanel
          viewMode={controller.viewMode}
          messages={chat.messages}
          inputValue={chat.inputValue}
          isStreaming={chat.isStreaming}
          chatAreaRef={chat.chatAreaRef}
          onInputChange={chat.setInputValue}
          onSendMessage={chat.sendMessage}
        />
      </div>
    </div>
  );
}


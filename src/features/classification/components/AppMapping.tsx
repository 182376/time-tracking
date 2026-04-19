import { RefreshCw, Save, Sparkles, SlidersHorizontal } from "lucide-react";
import { UI_TEXT } from "../../../shared/copy/uiText.ts";
import QuietDialog from "../../../shared/components/QuietDialog";
import QuietPageHeader from "../../../shared/components/QuietPageHeader";
import QuietSegmentedFilter from "../../../shared/components/QuietSegmentedFilter";
import CategoryColorControls from "./CategoryColorControls";
import AppMappingCandidateCard from "./AppMappingCandidateCard";
import { useAppMappingState } from "../hooks/useAppMappingState";
import type { CandidateFilter } from "../types";

interface Props {
  icons: Record<string, string>;
  onDirtyChange?: (dirty: boolean) => void;
  onOverridesChanged?: () => void;
  onSessionsDeleted?: () => void;
  onRegisterSaveHandler?: (handler: (() => Promise<boolean>) | null) => void;
}

const FILTER_OPTIONS: Array<{ value: CandidateFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "other", label: "未分类" },
  { value: "classified", label: "已分类" },
];

export default function AppMapping(props: Props) {
  const {
    dialogs,
    loading,
    draftState,
    savedState,
    filter,
    setFilter,
    counts,
    saveStatus,
    saving,
    hasUnsavedChanges,
    handleCancel,
    handleSave,
    filteredCandidates,
    showCategoryDialog,
    setShowCategoryDialog,
    colorFormat,
    setColorFormat,
    categoryControlCategories,
    candidateCategoryOptions,
    resolveCategoryColor,
    handleCreateCustomCategory,
    handleDeleteCategory,
    resolveEffectiveDisplayName,
    resolveCandidateColor,
    resolveMappedCategory,
    resolveTrackingEnabled,
    resolveTitleCaptureEnabled,
    deletingSessionsExe,
    editingNameExe,
    nameDrafts,
    draftOverrides,
    syncNameDraftToPageDraft,
    handleNameBlur,
    handleNameEditCancel,
    startNameEdit,
    handleColorAssign,
    handleCategoryAssign,
    handleTitleCaptureToggle,
    handleTrackingToggle,
    handleResetAppOverride,
    handleDeleteAllSessions,
    applyCategoryColor,
  } = useAppMappingState(props);

  if (loading || !draftState || !savedState) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-[var(--qp-text-tertiary)]">
        <RefreshCw size={15} className="animate-spin" />
        {UI_TEXT.mapping.loading}
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 md:gap-5 overflow-hidden">
      <QuietPageHeader
        icon={<Sparkles size={18} />}
        title={UI_TEXT.mapping.title}
        subtitle={UI_TEXT.mapping.subtitle}
        rightSlot={(
          <div className="flex items-center gap-2.5">
            <div className="qp-status flex px-3 py-1.5 rounded-[8px] items-center text-xs font-semibold">
              {saveStatus === "saving" && (
                <span className="text-[var(--qp-accent-default)] flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin" />
                  {UI_TEXT.mapping.saving}
                </span>
              )}
              {saveStatus === "saved" && !hasUnsavedChanges && (
                <span className="text-[var(--qp-success)] flex items-center gap-1.5">
                  <Save size={14} />
                  {UI_TEXT.mapping.saved}
                </span>
              )}
              {saveStatus !== "saving" && hasUnsavedChanges && (
                <span className="text-[var(--qp-warning)]">{UI_TEXT.mapping.unsaved}</span>
              )}
              {saveStatus === "idle" && !hasUnsavedChanges && (
                <span className="text-[var(--qp-text-tertiary)]">{UI_TEXT.mapping.idle}</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCancel}
              disabled={!hasUnsavedChanges || saving}
              className="qp-button-secondary rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {UI_TEXT.mapping.cancel}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!hasUnsavedChanges || saving}
              className="qp-button-primary rounded-[8px] px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? UI_TEXT.mapping.saving : UI_TEXT.mapping.save}
            </button>
          </div>
        )}
      />

      <section className="qp-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <QuietSegmentedFilter
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS.map((item) => {
              const count = item.value === "all"
                ? counts.all
                : item.value === "other"
                  ? counts.other
                  : counts.classified;
              return {
                value: item.value,
                label: `${item.label} (${count})`,
              };
            })}
          />
          <button
            type="button"
            onClick={() => setShowCategoryDialog(true)}
            className="qp-button-secondary inline-flex items-center gap-2 rounded-[8px] px-3 py-2 text-xs font-semibold"
          >
            <SlidersHorizontal size={14} />
            {UI_TEXT.mapping.categoryControl}
          </button>
        </div>
      </section>

      <div className="qp-panel flex-1 min-h-0 p-4">
        {filteredCandidates.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--qp-text-tertiary)]">
            {UI_TEXT.mapping.emptyState}
          </div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar pr-1">
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {filteredCandidates.map((candidate) => {
                const displayName = resolveEffectiveDisplayName(candidate);
                const displayColor = resolveCandidateColor(candidate);
                const assignedCategory = resolveMappedCategory(candidate);
                const trackingEnabled = resolveTrackingEnabled(candidate);
                const titleCaptureEnabled = resolveTitleCaptureEnabled(candidate);
                const isBusy = saving || deletingSessionsExe === candidate.exeName;
                const isEditingName = editingNameExe === candidate.exeName;
                const inputValue = nameDrafts[candidate.exeName] ?? displayName;
                const hasManualColor = Boolean(draftOverrides[candidate.exeName]?.color);

                return (
                  <AppMappingCandidateCard
                    key={candidate.exeName}
                    candidate={candidate}
                    icon={props.icons[candidate.exeName]}
                    displayName={displayName}
                    displayColor={displayColor}
                    assignedCategory={assignedCategory}
                    trackingEnabled={trackingEnabled}
                    titleCaptureEnabled={titleCaptureEnabled}
                    isBusy={isBusy}
                    isEditingName={isEditingName}
                    inputValue={inputValue}
                    hasManualColor={hasManualColor}
                    colorFormat={colorFormat}
                    categoryOptions={candidateCategoryOptions}
                    onNameDraftChange={(nextValue) => syncNameDraftToPageDraft(candidate, nextValue)}
                    onNameBlur={() => {
                      handleNameBlur(candidate);
                    }}
                    onNameEditCancel={() => {
                      handleNameEditCancel(candidate);
                    }}
                    onStartNameEdit={() => {
                      startNameEdit(candidate);
                    }}
                    onColorAssign={(nextColor) => handleColorAssign(candidate, nextColor)}
                    onColorFormatChange={setColorFormat}
                    onCategoryAssign={(value) => handleCategoryAssign(candidate, value)}
                    onToggleTitleCapture={() => handleTitleCaptureToggle(candidate, !titleCaptureEnabled)}
                    onToggleTracking={() => handleTrackingToggle(candidate, !trackingEnabled)}
                    onResetOverride={() => handleResetAppOverride(candidate)}
                    onDeleteAllSessions={() => {
                      void handleDeleteAllSessions(candidate);
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <QuietDialog
        open={showCategoryDialog}
        title="分类控制"
        description="在这里新建分类并调整分类主色"
        onClose={() => setShowCategoryDialog(false)}
        surfaceClassName="qp-category-dialog-surface"
        actions={(
          <>
            <button
              type="button"
              onClick={() => setShowCategoryDialog(false)}
              className="qp-button-secondary qp-dialog-action"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => void handleCreateCustomCategory()}
              className="qp-button-primary qp-dialog-action"
            >
              + 新建分类
            </button>
          </>
        )}
      >
        <div className="qp-category-dialog-body custom-scrollbar">
          <CategoryColorControls
            categories={categoryControlCategories}
            colorFormat={colorFormat}
            getCategoryColor={resolveCategoryColor}
            onColorFormatChange={setColorFormat}
            onApplyColor={applyCategoryColor}
            onDeleteCategory={handleDeleteCategory}
          />
        </div>
      </QuietDialog>

      {dialogs}
    </div>
  );
}

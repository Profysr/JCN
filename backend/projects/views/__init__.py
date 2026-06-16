# Re-export every view so that `from projects.views import XView` keeps working.

from .board import (
    BoardListCreateView,
    BoardDetailView,
    PortfolioView,
    BoardMemberListCreateView,
    BoardMemberDetailView,
    UserPresenceView,
    MyWorkView,
)

from .tasks import (
    TaskStatusListCreateView,
    TaskStatusDetailView,
    TaskStatusReorderView,
    TaskStatusBulkUpdateView,
    TaskListCreateView,
    TaskDetailView,
    TaskMoveView,
    SubTaskListCreateView,
    SubTaskDetailView,
    TaskActivityListView,
    TaskCommentListCreateView,
    TaskCommentDetailView,
    LabelListCreateView,
    LabelDetailView,
    BoardFieldListCreateView,
    BoardFieldDetailView,
    TaskFieldValueView,
    SavedViewListCreateView,
    SavedViewDetailView,
    SprintListCreateView,
    SprintDetailView,
    SprintBurndownView,
    TaskBulkUpdateView,
    TaskAttachmentListCreateView,
    TaskAttachmentDeleteView,
    TaskDependencyListCreateView,
    TaskDependencyDeleteView,
    TaskExportView,
    TaskCloneView,
    TaskChildrenView,
    TaskTemplateListCreateView,
    TaskTemplateDetailView,
    TaskApplyTemplateView,
    CommentReactionToggleView,
    ApprovalListCreateView,
    ApprovalReviewView,
    ApprovalResubmitView,
)

from .search import GlobalSearchView

from .wiki import (
    WikiPageListCreateView,
    WikiPageDetailView,
    WikiPageRevisionsView,
    DocumentListCreateView,
    DocumentDetailView,
)

from .forms import (
    FormListCreateView,
    FormDetailView,
    FormFieldsBulkUpdateView,
    PublicFormView,
    PublicFormSubmitView,
    FormSubmissionListView,
)

from .automation import (
    AutomationRuleListCreateView,
    AutomationRuleDetailView,
    AutomationLogListView,
)

from .objectives import (
    ObjectiveListCreateView,
    ObjectiveDetailView,
    KeyResultListCreateView,
    KeyResultDetailView,
    KeyResultLinkedTasksView,
)

__all__ = [
    # board
    "BoardListCreateView",
    "BoardDetailView",
    "PortfolioView",
    "BoardMemberListCreateView",
    "BoardMemberDetailView",
    "UserPresenceView",
    "MyWorkView",
    # tasks
    "TaskStatusListCreateView",
    "TaskStatusDetailView",
    "TaskStatusReorderView",
    "TaskStatusBulkUpdateView",
    "TaskListCreateView",
    "TaskDetailView",
    "TaskMoveView",
    "SubTaskListCreateView",
    "SubTaskDetailView",
    "TaskActivityListView",
    "TaskCommentListCreateView",
    "TaskCommentDetailView",
    "LabelListCreateView",
    "LabelDetailView",
    "BoardFieldListCreateView",
    "BoardFieldDetailView",
    "TaskFieldValueView",
    "SavedViewListCreateView",
    "SavedViewDetailView",
    "SprintListCreateView",
    "SprintDetailView",
    "SprintBurndownView",
    "TaskBulkUpdateView",
    "TaskAttachmentListCreateView",
    "TaskAttachmentDeleteView",
    "TaskDependencyListCreateView",
    "TaskDependencyDeleteView",
    "TaskExportView",
    "TaskCloneView",
    "TaskChildrenView",
    "TaskTemplateListCreateView",
    "TaskTemplateDetailView",
    "TaskApplyTemplateView",
    "CommentReactionToggleView",
    "ApprovalListCreateView",
    "ApprovalReviewView",
    "ApprovalResubmitView",
    # search
    "GlobalSearchView",
    # wiki
    "WikiPageListCreateView",
    "WikiPageDetailView",
    "WikiPageRevisionsView",
    "DocumentListCreateView",
    "DocumentDetailView",
    # forms
    "FormListCreateView",
    "FormDetailView",
    "FormFieldsBulkUpdateView",
    "PublicFormView",
    "PublicFormSubmitView",
    "FormSubmissionListView",
    # automation
    "AutomationRuleListCreateView",
    "AutomationRuleDetailView",
    "AutomationLogListView",
    # objectives
    "ObjectiveListCreateView",
    "ObjectiveDetailView",
    "KeyResultListCreateView",
    "KeyResultDetailView",
    "KeyResultLinkedTasksView",
]

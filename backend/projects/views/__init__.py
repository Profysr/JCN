# Re-export every view so that `from projects.views import XView` keeps working.

from .board import (
    BoardListCreateView,
    BoardDetailView,
    PortfolioView,
    BoardMemberListCreateView,
    BoardMemberDetailView,
    BoardMemberBulkCreateView,
    BoardPermissionsView,
    UserPresenceView,
)

from .tasks import (
    TaskStatusListCreateView,
    TaskStatusBulkUpdateView,
    TaskListCreateView,
    TaskDetailView,
    TaskMoveView,
    SubTaskListCreateView,
    SubTaskDetailView,
    TaskActivityListView,
    LabelListCreateView,
    LabelDetailView,
    BoardFieldListCreateView,
    BoardFieldDetailView,
    TaskFieldValueView,
    SavedViewListCreateView,
    SavedViewDetailView,
    SprintListCreateView,
    SprintDetailView,
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
    ApprovalListCreateView,
    ApprovalReviewView,
    ApprovalResubmitView,
    MyWorkView,
)

from .comments import (
    TaskCommentListCreateView,
    TaskCommentDetailView,
    CommentReactionToggleView,
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

# ‼️ Automation disabled — views exist but routes are commented out in urls.py
# from .automation import (
#     AutomationRuleListCreateView,
#     AutomationRuleDetailView,
#     AutomationLogListView,
# )

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
    "BoardMemberBulkCreateView",
    "UserPresenceView",
    # tasks
    "TaskStatusListCreateView",
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
    "MyWorkView",
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
    # ‼️ automation disabled
    # "AutomationRuleListCreateView",
    # "AutomationRuleDetailView",
    # "AutomationLogListView",
    # objectives
    "ObjectiveListCreateView",
    "ObjectiveDetailView",
    "KeyResultListCreateView",
    "KeyResultDetailView",
    "KeyResultLinkedTasksView",
]

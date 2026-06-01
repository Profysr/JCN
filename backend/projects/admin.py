from django.contrib import admin
from .models import Project, TaskStatus, Task, SubTask, TaskComment, TaskActivity, Label, ProjectField, TaskFieldValue, SavedView, Sprint


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["name", "workspace", "status", "created_by", "created_at"]
    list_filter = ["status"]
    search_fields = ["name"]


@admin.register(TaskStatus)
class TaskStatusAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "color", "order"]


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "project", "status", "priority", "assignee", "due_date"]
    list_filter = ["priority"]
    search_fields = ["title"]


@admin.register(SubTask)
class SubTaskAdmin(admin.ModelAdmin):
    list_display = ["title", "task", "is_done"]


@admin.register(TaskComment)
class TaskCommentAdmin(admin.ModelAdmin):
    list_display = ["task", "author", "created_at"]


@admin.register(TaskActivity)
class TaskActivityAdmin(admin.ModelAdmin):
    list_display = ["task", "actor", "verb", "created_at"]
    list_filter = ["verb"]


@admin.register(Label)
class LabelAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "color"]
    search_fields = ["name"]


@admin.register(ProjectField)
class ProjectFieldAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "type", "order"]
    list_filter = ["type"]


@admin.register(TaskFieldValue)
class TaskFieldValueAdmin(admin.ModelAdmin):
    list_display = ["task", "field", "value"]


@admin.register(SavedView)
class SavedViewAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "user", "created_at"]


@admin.register(Sprint)
class SprintAdmin(admin.ModelAdmin):
    list_display = ["name", "project", "status", "start_date", "end_date"]
    list_filter = ["status"]

import uuid
from django.db import models
from django.conf import settings
from workspaces.models import Workspace


class Report(models.Model):
    """A saved custom report with a chart config and data source."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="reports"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # config keys: data_source, group_by, date_range_days, project_id, period
    config = models.JSONField(default=dict)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({self.workspace})"

from rest_framework import serializers
from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model  = Report
        fields = ["id", "name", "description", "config", "owner", "owner_name", "created_at", "updated_at"]
        read_only_fields = ["id", "owner", "owner_name", "created_at", "updated_at"]

    def get_owner_name(self, obj):
        return obj.owner.full_name or obj.owner.email.split("@")[0]

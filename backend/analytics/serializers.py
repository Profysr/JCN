from rest_framework import serializers


class HeatmapMemberSerializer(serializers.Serializer):
    """
    Serializes a User model instance into the heatmap row shape.
    Requires 'day_counts' in context: {str(user_id): {date_str: int}}.
    """
    user_id = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    email = serializers.EmailField()
    days = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    def get_user_id(self, obj):
        return str(obj.id)

    def get_name(self, obj):
        return obj.full_name or obj.email.split("@")[0]

    def get_days(self, obj):
        return self.context["day_counts"][str(obj.id)]

    def get_total(self, obj):
        return sum(self.context["day_counts"][str(obj.id)].values())

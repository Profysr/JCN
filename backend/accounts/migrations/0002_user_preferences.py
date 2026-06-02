from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="theme",
            field=models.CharField(
                choices=[("light", "Light"), ("dark", "Dark"), ("midnight", "Midnight")],
                default="light",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="accent_color",
            field=models.CharField(
                choices=[
                    ("indigo", "Indigo"), ("blue", "Blue"), ("violet", "Violet"),
                    ("pink", "Pink"), ("rose", "Rose"), ("amber", "Amber"),
                    ("emerald", "Emerald"), ("cyan", "Cyan"), ("slate", "Slate"),
                ],
                default="indigo",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="density_mode",
            field=models.CharField(
                choices=[("comfortable", "Comfortable"), ("compact", "Compact"), ("cozy", "Cozy")],
                default="comfortable",
                max_length=16,
            ),
        ),
    ]

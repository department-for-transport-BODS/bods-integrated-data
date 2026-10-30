terraform {
  required_version = ">= 1.6.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.50"
    }
  }
}

module "integrated_data_table_renamer_function" {
  source = "../shared/lambda-function"

  environment     = var.environment
  function_name   = "integrated-data-table-renamer"
  zip_path        = "${path.module}/../../../src/functions/dist/table-renamer.zip"
  handler         = "index.handler"
  runtime         = "nodejs24.x"
  timeout         = 120
  memory          = 1024
  needs_db_access = var.environment != "local"
  vpc_id          = var.vpc_id
  subnet_ids      = var.private_subnet_ids
  database_sg_id  = var.db_sg_id

  permissions = [{
    Action = [
      "secretsmanager:GetSecretValue",
    ],
    Effect = "Allow",
    Resource = [
      var.db_secret_arn,
    ]
  }]

  env_vars = {
    STAGE                             = var.environment
    DB_HOST                           = var.db_host
    DB_PORT                           = var.db_port
    DB_SECRET_ARN                     = var.db_secret_arn
    DB_NAME                           = var.db_name
    CALENDAR_REQUIRED_PERCENTAGE      = var.calendar_required_percentage
    CALENDAR_DATE_REQUIRED_PERCENTAGE = var.calendar_date_required_percentage
    STOP_REQUIRED_PERCENTAGE          = var.stop_required_percentage
    SHAPE_REQUIRED_PERCENTAGE         = var.shape_required_percentage
    TRIP_REQUIRED_PERCENTAGE          = var.trip_required_percentage
    FREQUENCY_REQUIRED_PERCENTAGE     = var.frequency_required_percentage
    STOP_TIME_REQUIRED_PERCENTAGE     = var.stop_time_required_percentage
  }
}

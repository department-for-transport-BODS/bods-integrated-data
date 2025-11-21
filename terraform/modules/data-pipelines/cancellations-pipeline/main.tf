terraform {
  required_version = ">= 1.6.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.97"
    }
  }
}

data "aws_caller_identity" "current" {}

module "integrated_data_cancellations_s3_sqs" {
  source = "../../shared/s3-sqs"

  bucket_name                = "integrated-data-cancellations-raw-siri-sx-${var.environment}"
  sqs_name                   = "integrated-data-cancellations-queue-${var.environment}"
  dlq_name                   = "integrated-data-cancellations-dlq-${var.environment}"
  alarm_topic_arn            = var.alarm_topic_arn
  ok_topic_arn               = var.ok_topic_arn
  visibility_timeout_seconds = 60
}

module "integrated_data_cancellations_processor_function" {
  source = "../../shared/lambda-function"

  environment     = var.environment
  function_name   = "integrated-data-cancellations-processor"
  zip_path        = "${path.module}/../../../../src/functions/dist/cancellations-processor.zip"
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 60
  memory          = 1024
  needs_db_access = var.environment != "local"
  vpc_id          = var.vpc_id
  subnet_ids      = var.private_subnet_ids
  database_sg_id  = var.db_sg_id

  permissions = [
    {
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      Effect = "Allow",
      Resource = [
        module.integrated_data_cancellations_s3_sqs.sqs_arn
      ]
    },
    {
      Action = [
        "s3:GetObject",
      ],
      Effect = "Allow",
      Resource = [
        "${module.integrated_data_cancellations_s3_sqs.bucket_arn}/*"
      ]
    },
    {
      Action = [
        "secretsmanager:GetSecretValue",
      ],
      Effect = "Allow",
      Resource = [
        var.db_secret_arn
      ]
    },
    {
      Action   = ["dynamodb:GetItem"],
      Effect   = "Allow",
      Resource = "arn:aws:dynamodb:${var.aws_region}:${var.aws_account_id}:table/${var.cancellations_subscription_table_name}"
    },
    {
      Action   = ["dynamodb:BatchWriteItem"],
      Effect   = "Allow",
      Resource = "arn:aws:dynamodb:${var.aws_region}:${var.aws_account_id}:table/${var.cancellations_errors_table_name}"
    }
  ]

  env_vars = {
    STAGE                                 = var.environment
    DB_HOST                               = var.db_host
    DB_PORT                               = var.db_port
    DB_SECRET_ARN                         = var.db_secret_arn
    DB_NAME                               = var.db_name
    CANCELLATIONS_SUBSCRIPTION_TABLE_NAME = var.cancellations_subscription_table_name
    CANCELLATIONS_ERRORS_TABLE_NAME       = var.cancellations_errors_table_name
  }
}

resource "aws_lambda_event_source_mapping" "integrated_data_cancellations_processor_sqs_trigger" {
  event_source_arn = module.integrated_data_cancellations_s3_sqs.sqs_arn
  function_name    = module.integrated_data_cancellations_processor_function.lambda_arn
}

resource "aws_s3_bucket" "integrated_data_cancellations_siri_sx_bucket" {
  bucket = "integrated-data-cancellations-generated-siri-sx-${var.environment}"
}

resource "aws_s3_bucket_public_access_block" "integrated_data_cancellations_siri_sx_block_public" {
  bucket = aws_s3_bucket.integrated_data_cancellations_siri_sx_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "integrated_data_cancellations_siri_sx_bucket_versioning" {
  bucket = aws_s3_bucket.integrated_data_cancellations_siri_sx_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

module "siri_sx_downloader" {
  source = "../../shared/lambda-function"

  environment     = var.environment
  function_name   = "integrated-data-cancellations-siri-sx-downloader"
  zip_path        = "${path.module}/../../../../src/functions/dist/cancellations-siri-sx-downloader.zip"
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 300
  memory          = 2048
  needs_db_access = var.environment != "local"
  vpc_id          = var.vpc_id
  subnet_ids      = var.private_subnet_ids
  database_sg_id  = var.db_sg_id

  permissions = [
    {
      Action = [
        "s3:GetObject",
      ],
      Effect = "Allow",
      Resource = [
        "${aws_s3_bucket.integrated_data_cancellations_siri_sx_bucket.arn}/*"
      ]
    },
    {
      Action = [
        "secretsmanager:GetSecretValue",
      ],
      Effect = "Allow",
      Resource = [
        var.db_secret_arn
      ]
    }
  ]

  env_vars = {
    STAGE         = var.environment
    BUCKET_NAME   = aws_s3_bucket.integrated_data_cancellations_siri_sx_bucket.bucket
    DB_HOST       = var.db_reader_host
    DB_PORT       = var.db_port
    DB_SECRET_ARN = var.db_secret_arn
    DB_NAME       = var.db_name
  }
}

module "integrated_data_siri_sx_generator_lambda" {
  source = "../../shared/lambda-function"

  environment     = var.environment
  function_name   = "integrated-data-siri-sx-file-generator"
  zip_path        = "${path.module}/../../../../src/functions/dist/siri-sx-generator.zip"
  timeout         = 30
  memory          = 3072
  needs_db_access = var.environment != "local"
  vpc_id          = var.vpc_id
  subnet_ids      = var.private_subnet_ids
  database_sg_id  = var.db_sg_id

  permissions = [
    {
      Action = [
        "secretsmanager:GetSecretValue",
      ],
      Effect = "Allow",
      Resource = [
        var.db_secret_arn
      ]
    },
    {
      "Effect" : "Allow",
      "Action" : "s3:PutObject",
      "Resource" : [
        "${aws_s3_bucket.integrated_data_cancellations_siri_sx_bucket.arn}/*",
      ]
    }
  ]

  env_vars = {
    DB_READER_HOST = var.db_reader_host
    DB_PORT        = var.db_port
    DB_SECRET_ARN  = var.db_secret_arn
    DB_NAME        = var.db_name
    BUCKET_NAME    = aws_s3_bucket.integrated_data_cancellations_siri_sx_bucket.bucket
    STAGE          = var.environment
  }

  runtime                    = var.environment == "local" ? "nodejs20.x" : null
  handler                    = var.environment == "local" ? "index.handler" : null
  deploy_as_container_lambda = var.environment != "local"
}

module "integrated_data_siri_sx_generator_sfn" {
  count = var.environment == "local" ? 0 : 1

  source = "../../shared/lambda-trigger-sfn"

  environment          = var.environment
  function_arn         = module.integrated_data_siri_sx_generator_lambda.lambda_arn
  invoke_every_seconds = var.siri_sx_generator_frequency
  step_function_name   = "integrated-data-siri-sx-file-generator"
}

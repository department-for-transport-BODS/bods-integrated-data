terraform {
  required_version = ">= 1.6.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.50"
    }
  }
}

locals {
  source_code_hash = (fileexists(var.zip_path) ? filebase64sha256(var.zip_path) : data.aws_lambda_function.existing_function[0].code_sha256)
  function_name    = "${var.function_name}-${var.environment}"
  image_tag        = var.deploy_as_container_lambda ? (fileexists(var.zip_path) ? filesha256(var.zip_path) : split(":", data.aws_lambda_function.existing_function[0].image_uri)[1]) : null
  image_uri        = var.deploy_as_container_lambda ? "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com/${aws_ecr_repository.ecr_repository[0].name}:${local.image_tag}" : null
  path_to_src      = "${path.module}/../../../../src"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_ecr_repository" "ecr_repository" {
  count = var.deploy_as_container_lambda ? 1 : 0

  name                 = local.function_name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "terraform_data" "build_image" {
  count = var.deploy_as_container_lambda ? 1 : 0

  triggers_replace = [
    local.image_tag,
  ]

  provisioner "local-exec" {
    command = "aws ecr get-login-password --region ${data.aws_region.current.region} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com"
  }

  provisioner "local-exec" {
    command = "docker build --platform=linux/arm64 --provenance false --file ${local.path_to_src}/Dockerfile.lambda --build-arg SERVICE_NAME=${split(".", basename(var.zip_path))[0]} -t ${local.image_uri} ${local.path_to_src}/functions/dist"
  }

  provisioner "local-exec" {
    command = "docker push ${local.image_uri}"
  }
}

data "aws_lambda_function" "existing_function" {
  count         = fileexists(var.zip_path) ? 0 : 1
  function_name = local.function_name
}

resource "aws_security_group" "db_sg" {
  count  = var.needs_db_access ? 1 : 0
  name   = "${var.function_name}-sg-${var.environment}"
  vpc_id = var.vpc_id
}

resource "aws_vpc_security_group_egress_rule" "db_sg_allow_all_egress_ipv4" {
  count             = var.needs_db_access ? 1 : 0
  security_group_id = aws_security_group.db_sg[0].id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}

resource "aws_vpc_security_group_egress_rule" "db_sg_allow_all_egress_ipv6" {
  count             = var.needs_db_access ? 1 : 0
  security_group_id = aws_security_group.db_sg[0].id

  cidr_ipv6   = "::/0"
  ip_protocol = "-1"
}

resource "aws_vpc_security_group_ingress_rule" "db_sg_allow_lambda_ingress" {
  count                        = var.needs_db_access ? 1 : 0
  security_group_id            = var.database_sg_id
  referenced_security_group_id = aws_security_group.db_sg[0].id

  from_port = 5432
  to_port   = 5432

  ip_protocol = "tcp"
}

resource "aws_iam_policy" "lambda_policy" {
  count = var.permissions != null ? 1 : 0

  name = "${var.function_name}-policy-${var.environment}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(var.permissions, [
      {
        Action = [
          "cloudwatch:PutMetricData"
        ],
        Effect   = "Allow",
        Resource = "*"
      }
    ])
  })
}

resource "aws_iam_role" "lambda_role" {
  name = "${var.function_name}-role-${var.environment}"

  assume_role_policy = jsonencode({
    "Version" : "2012-10-17",
    "Statement" : [
      {
        "Effect" : "Allow",
        "Principal" : {
          "Service" : "lambda.amazonaws.com"
        },
        "Action" : "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_role_lambda_policy_attachment" {
  role = aws_iam_role.lambda_role.id
  policy_arn = (var.subnet_ids != null ? "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" :
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole")
}

resource "aws_iam_role_policy_attachment" "lambda_role_custom_policy_attachment" {
  count = var.permissions != null ? 1 : 0

  role       = aws_iam_role.lambda_role.id
  policy_arn = aws_iam_policy.lambda_policy[0].arn
}

resource "aws_iam_role_policy_attachment" "insights_policy" {
  role       = aws_iam_role.lambda_role.id
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy"
}

resource "aws_lambda_function" "function" {
  depends_on = [terraform_data.build_image]

  function_name    = local.function_name
  filename         = !var.deploy_as_container_lambda ? var.zip_path : null
  role             = aws_iam_role.lambda_role.arn
  handler          = !var.deploy_as_container_lambda ? var.handler : null
  source_code_hash = !var.deploy_as_container_lambda ? local.source_code_hash : null
  architectures    = var.architectures

  runtime     = !var.deploy_as_container_lambda ? var.runtime : null
  timeout     = var.timeout
  memory_size = var.memory

  image_uri    = var.deploy_as_container_lambda ? local.image_uri : null
  package_type = var.deploy_as_container_lambda ? "Image" : "Zip"

  dynamic "ephemeral_storage" {
    for_each = var.ephemeral_storage != null ? [1] : []

    content {
      size = var.ephemeral_storage
    }

  }

  reserved_concurrent_executions = var.reserved_concurrency != null ? var.reserved_concurrency : null

  layers = var.environment != "local" && !var.deploy_as_container_lambda ? [
    "arn:aws:lambda:eu-west-2:580247275435:layer:LambdaInsightsExtension-Arm64:20"
  ] : []

  dynamic "vpc_config" {
    for_each = var.needs_db_access || var.needs_vpc_access ? [1] : []

    content {
      subnet_ids = var.subnet_ids
      security_group_ids = var.needs_db_access ? [
        aws_security_group.db_sg[0].id
      ] : [var.custom_sg_id]
    }
  }

  environment {
    variables = merge(var.env_vars != null ? var.env_vars : {}, {
      LOG_LEVEL = var.log_level
    })
  }
}

resource "aws_cloudwatch_event_rule" "schedule" {
  count               = var.schedule != null ? 1 : 0
  name                = "schedule-${aws_lambda_function.function.function_name}"
  description         = "Schedule for ${aws_lambda_function.function.function_name}"
  schedule_expression = var.schedule
}

resource "aws_cloudwatch_event_target" "schedule_lambda" {
  count = var.schedule != null ? 1 : 0
  rule  = aws_cloudwatch_event_rule.schedule[0].name
  arn   = aws_lambda_function.function.arn
}


resource "aws_lambda_permission" "allow_events_bridge_to_run_lambda" {
  count         = var.schedule != null ? 1 : 0
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule[0].arn
}

resource "aws_lambda_permission" "allow_bucket_trigger" {
  count         = var.s3_bucket_trigger != null ? 1 : 0
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.s3_bucket_trigger.arn
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  count  = var.s3_bucket_trigger != null ? 1 : 0
  bucket = var.s3_bucket_trigger.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.function.arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_lambda_permission.allow_bucket_trigger]
}

resource "aws_lambda_function_event_invoke_config" "retry_config" {
  count                  = var.retry_attempts != null ? 1 : 0
  function_name          = aws_lambda_function.function.function_name
  maximum_retry_attempts = var.retry_attempts
}

output "lambda_arn" {
  value = aws_lambda_function.function.arn
}

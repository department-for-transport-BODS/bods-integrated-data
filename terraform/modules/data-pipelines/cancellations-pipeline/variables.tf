variable "environment" {
  type        = string
  description = "Environment"
}

variable "aws_account_id" {
  type        = string
  description = "AWS account id"
}

variable "aws_region" {
  type        = string
  description = "AWS region"
}

variable "ok_topic_arn" {
  type        = string
  description = "ARN of the SNS topic to use for ok notifications"
}

variable "alarm_topic_arn" {
  type        = string
  description = "ARN of the SNS topic to use for alarm notifications"
}


variable "db_secret_arn" {
  type        = string
  description = "ARN of the secret containing the database credentials"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "db_name" {
  type    = string
  default = "bods_integrated_data"
}

variable "db_host" {
  type = string
}

variable "db_reader_host" {
  type = string
}

variable "db_port" {
  type    = number
  default = 5432
}

variable "db_sg_id" {
  type        = string
  description = "Database Security Group ID"
}

variable "siri_sx_generator_frequency" {
  type        = number
  description = "Frequency in seconds at which to run the SIRI-SX Generator"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of Subnet IDs"
}

variable "cancellations_subscription_table_name" {
  type        = string
  description = "Cancellations subscription DynamoDB table name"
}

variable "cancellations_errors_table_name" {
  type        = string
  description = "Cancellations errors DynamoDB table name"
}

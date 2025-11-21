terraform {
  required_version = ">= 1.6.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.97"
    }

    sops = {
      source  = "carlpett/sops"
      version = "~> 1.0"
    }
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "sops_file" "secrets" {
  source_file = "secrets.enc.json"
}

locals {
  env     = "local"
  secrets = jsondecode(data.sops_file.secrets.raw)
}

module "integrated_data_db_migrator" {
  source = "../modules/database/db-migrator"

  environment        = local.env
  vpc_id             = null
  private_subnet_ids = null
  db_secret_arn      = "*"
  db_sg_id           = null
  db_host            = null
}

module "integrated_data_noc_pipeline" {
  source = "../modules/data-pipelines/noc-pipeline"

  environment        = local.env
  vpc_id             = null
  private_subnet_ids = null
  db_secret_arn      = "*"
  db_sg_id           = null
  db_host            = null
}

module "integrated_data_table_renamer" {
  source = "../modules/table-renamer"

  environment        = local.env
  vpc_id             = null
  private_subnet_ids = null
  db_secret_arn      = "*"
  db_sg_id           = null
  db_host            = null
}

module "integrated_data_naptan_pipeline" {
  source = "../modules/data-pipelines/naptan-pipeline"

  environment        = local.env
  vpc_id             = null
  private_subnet_ids = null
  db_secret_arn      = "*"
  db_sg_id           = null
  db_host            = null
}

module "integrated_data_bods_netex_pipeline" {
  source = "../modules/data-pipelines/netex-pipeline"

  environment = local.env
}

module "integrated_data_nptg_pipeline" {
  source = "../modules/data-pipelines/nptg-pipeline"

  environment        = local.env
  vpc_id             = null
  private_subnet_ids = null
  db_secret_arn      = "*"
  db_sg_id           = null
  db_host            = null
}

module "integrated_data_txc_pipeline" {
  source = "../modules/data-pipelines/txc-pipeline"

  environment               = local.env
  vpc_id                    = null
  private_subnet_ids        = null
  db_secret_arn             = "*"
  db_sg_id                  = null
  db_host                   = null
  aws_account_id            = data.aws_caller_identity.current.account_id
  aws_region                = data.aws_region.current.name
  tnds_ftp_credentials      = local.secrets["tnds_ftp"]
  rds_output_bucket_name    = "integrated-data-aurora-output-${local.env}"
  bank_holidays_bucket_name = module.integrated_data_bank_holidays_pipeline.bank_holidays_bucket_name
  tfl_txc_bucket_name       = module.integrated_data_tfl_pipeline.tfl_txc_bucket_name
}

# module "integrated_data_gtfs_rt_pipeline" {
#   source = "../modules/data-pipelines/gtfs-rt-pipeline"
#
#   environment                        = local.env
#   vpc_id                             = null
#   private_subnet_ids                 = null
#   db_secret_arn                      = "*"
#   db_sg_id                           = null
#   db_reader_host                     = null
#   gtfs_rt_service_alerts_bucket_arn  = module.integrated_data_disruptions_pipeline.disruptions_gtfs_rt_bucket_arn
#   gtfs_rt_service_alerts_bucket_name = module.integrated_data_disruptions_pipeline.disruptions_gtfs_rt_bucket_name
# }
#
# module "integrated_data_gtfs_downloader" {
#   source = "../modules/gtfs-downloader"
#
#   environment      = local.env
#   gtfs_bucket_name = module.integrated_data_txc_pipeline.gtfs_timetables_bucket_name
# }
#
#
# module "mock_data_producer_api" {
#   source = "../modules/mock-data-producer-api"
#
#   environment                           = local.env
#   aws_account_id                        = data.aws_caller_identity.current.account_id
#   aws_region                            = data.aws_region.current.name
#   avl_consumer_data_endpoint            = module.integrated_data_avl_data_producer_api.data_endpoint_function_url
#   avl_subscription_table_name           = module.integrated_data_avl_subscription_table.table_name
#   cancellations_consumer_data_endpoint  = module.integrated_data_cancellations_data_producer_api.data_endpoint_function_url
#   cancellations_subscription_table_name = module.integrated_data_cancellations_data_producer_api.subscriptions_table_name
# }
#
# module "integrated_data_avl_pipeline" {
#   source = "../modules/data-pipelines/avl-pipeline"
#
#   environment                                 = local.env
#   vpc_id                                      = null
#   private_subnet_ids                          = null
#   db_secret_arn                               = "*"
#   db_sg_id                                    = null
#   db_host                                     = null
#   db_reader_host                              = null
#   alarm_topic_arn                             = ""
#   ok_topic_arn                                = ""
#   tfl_api_keys                                = local.secrets["tfl_api_keys"]
#   tfl_location_retriever_invoke_every_seconds = 60
#   avl_subscription_table_name                 = module.integrated_data_avl_subscription_table.table_name
#   gtfs_trip_maps_table_name                   = module.integrated_data_txc_pipeline.gtfs_trip_maps_table_name
#   aws_account_id                              = data.aws_caller_identity.current.account_id
#   aws_region                                  = data.aws_region.current.name
#   siri_vm_generator_frequency                 = 240
#   avl_validation_error_table_name             = module.integrated_data_avl_validation_error_table.table_name
#   gtfs_rt_bucket_name                         = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_bucket_name
#   gtfs_rt_bucket_arn                          = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_bucket_arn
#   save_json                                   = true
#   abods_account_ids                           = []
# }
#
# module "integrated_data_avl_subscription_table" {
#   source = "../modules/shared/dynamo-table"
#
#   environment = local.env
#   table_name  = "integrated-data-avl-subscription-table"
# }
#
# module "integrated_data_avl_validation_error_table" {
#   source = "../modules/shared/dynamo-table"
#
#   environment   = local.env
#   table_name    = "integrated-data-avl-validation-error-table"
#   ttl_attribute = "timeToExist"
# }
#
# module "integrated_data_avl_data_producer_api" {
#   source                                    = "../modules/avl-producer-api"
#   avl_raw_siri_bucket_name                  = module.integrated_data_avl_pipeline.avl_raw_siri_bucket_name
#   avl_subscription_table_name               = module.integrated_data_avl_subscription_table.table_name
#   aws_account_id                            = data.aws_caller_identity.current.account_id
#   aws_region                                = data.aws_region.current.name
#   environment                               = local.env
#   sg_id                                     = ""
#   subnet_ids                                = []
#   acm_certificate_arn                       = ""
#   hosted_zone_id                            = ""
#   domain                                    = ""
#   avl_producer_api_key                      = local.secrets["avl_producer_api_key"]
#   avl_error_table_name                      = module.integrated_data_avl_validation_error_table.table_name
#   mock_data_producer_subscribe_function_url = module.mock_data_producer_api.subscribe_function_url
# }
#
module "integrated_data_bank_holidays_pipeline" {
  source = "../modules/data-pipelines/bank-holidays-pipeline"

  environment = local.env
}

module "integrated_data_tfl_pipeline" {
  source = "../modules/data-pipelines/tfl-pipeline"

  environment               = local.env
  vpc_id                    = null
  private_subnet_ids        = null
  db_secret_arn             = "*"
  db_sg_id                  = null
  db_host                   = null
  bank_holidays_bucket_name = module.integrated_data_bank_holidays_pipeline.bank_holidays_bucket_name
}

# module "integrated_data_db_cleardown_function" {
#   source = "../modules/db-cleardown"
#
#   environment        = local.env
#   vpc_id             = null
#   private_subnet_ids = null
#   db_secret_arn      = "*"
#   db_sg_id           = null
#   db_host            = null
# }
#
# module "integrated_data_disruptions_pipeline" {
#   source = "../modules/data-pipelines/disruptions-pipeline"
#
#   environment        = local.env
#   vpc_id             = null
#   private_subnet_ids = null
#   db_secret_arn      = "*"
#   db_sg_id           = null
#   db_host            = null
#   retriever_schedule = "rate(5 minutes)"
#   save_json          = true
# }
#
# module "integrated_data_cancellations_pipeline" {
#   source = "../modules/data-pipelines/cancellations-pipeline"
#
#   environment                           = local.env
#   aws_account_id                        = data.aws_caller_identity.current.account_id
#   aws_region                            = data.aws_region.current.name
#   vpc_id                                = null
#   private_subnet_ids                    = null
#   db_secret_arn                         = "*"
#   db_sg_id                              = null
#   db_host                               = null
#   db_reader_host                        = null
#   alarm_topic_arn                       = ""
#   ok_topic_arn                          = ""
#   cancellations_subscription_table_name = module.integrated_data_cancellations_data_producer_api.subscriptions_table_name
#   cancellations_errors_table_name       = module.integrated_data_cancellations_data_producer_api.errors_table_name
#   siri_sx_generator_frequency           = 240
# }
#
# module "integrated_data_cancellations_data_producer_api" {
#   source = "../modules/cancellations-producer-api"
#
#   aws_account_id                            = data.aws_caller_identity.current.account_id
#   aws_region                                = data.aws_region.current.name
#   environment                               = local.env
#   acm_certificate_arn                       = ""
#   hosted_zone_id                            = ""
#   domain                                    = ""
#   cancellations_producer_api_key            = local.secrets["cancellations_producer_api_key"]
#   sg_id                                     = ""
#   subnet_ids                                = []
#   mock_data_producer_subscribe_function_url = module.mock_data_producer_api.subscribe_function_url
#   cancellations_raw_siri_bucket_name        = module.integrated_data_cancellations_pipeline.cancellations_raw_siri_bucket_name
# }
#
# module "siri_consumer_api_private" {
#   source = "../modules/siri-consumer-api"
#
#   environment                                   = local.env
#   aws_region                                    = data.aws_region.current.name
#   account_id                                    = data.aws_caller_identity.current.account_id
#   api_name                                      = "integrated-data-siri-consumer-api-private"
#   private                                       = true
#   siri_vm_downloader_invoke_arn                 = module.integrated_data_avl_pipeline.siri_vm_downloader_invoke_arn
#   siri_vm_downloader_function_name              = module.integrated_data_avl_pipeline.siri_vm_downloader_function_name
#   siri_vm_stats_invoke_arn                      = module.integrated_data_avl_pipeline.siri_vm_stats_invoke_arn
#   siri_vm_stats_function_name                   = module.integrated_data_avl_pipeline.siri_vm_stats_function_name
#   avl_consumer_subscriber_invoke_arn            = module.integrated_data_avl_pipeline.avl_consumer_subscriber_invoke_arn
#   avl_consumer_subscriber_function_name         = module.integrated_data_avl_pipeline.avl_consumer_subscriber_function_name
#   avl_consumer_unsubscriber_invoke_arn          = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_invoke_arn
#   avl_consumer_unsubscriber_function_name       = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_function_name
#   avl_consumer_subscriptions_invoke_arn         = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_invoke_arn
#   avl_consumer_subscriptions_function_name      = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_function_name
#   siri_sx_downloader_invoke_arn                 = module.integrated_data_cancellations_pipeline.siri_sx_downloader_invoke_arn
#   siri_sx_downloader_function_name              = module.integrated_data_cancellations_pipeline.siri_sx_downloader_function_name
#   gtfs_downloader_invoke_arn                    = module.integrated_data_gtfs_downloader.gtfs_downloader_invoke_arn
#   gtfs_downloader_lambda_name                   = module.integrated_data_gtfs_downloader.gtfs_downloader_lambda_name
#   gtfs_region_retriever_invoke_arn              = module.integrated_data_gtfs_downloader.gtfs_region_retriever_invoke_arn
#   gtfs_region_retriever_lambda_name             = module.integrated_data_gtfs_downloader.gtfs_region_retriever_lambda_name
#   gtfs_rt_downloader_invoke_arn                 = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_invoke_arn
#   gtfs_rt_downloader_lambda_name                = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_lambda_name
#   gtfs_rt_service_alerts_downloader_invoke_arn  = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_invoke_arn
#   gtfs_rt_service_alerts_downloader_lambda_name = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_lambda_name
# }
#
# module "siri_consumer_api_public" {
#   source = "../modules/siri-consumer-api"
#
#   environment                                   = local.env
#   aws_region                                    = data.aws_region.current.name
#   account_id                                    = data.aws_caller_identity.current.account_id
#   api_name                                      = "integrated-data-siri-consumer-api-public"
#   private                                       = false
#   siri_vm_downloader_invoke_arn                 = module.integrated_data_avl_pipeline.siri_vm_downloader_invoke_arn
#   siri_vm_downloader_function_name              = module.integrated_data_avl_pipeline.siri_vm_downloader_function_name
#   siri_vm_stats_invoke_arn                      = module.integrated_data_avl_pipeline.siri_vm_stats_invoke_arn
#   siri_vm_stats_function_name                   = module.integrated_data_avl_pipeline.siri_vm_stats_function_name
#   avl_consumer_subscriber_invoke_arn            = module.integrated_data_avl_pipeline.avl_consumer_subscriber_invoke_arn
#   avl_consumer_subscriber_function_name         = module.integrated_data_avl_pipeline.avl_consumer_subscriber_function_name
#   avl_consumer_unsubscriber_invoke_arn          = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_invoke_arn
#   avl_consumer_unsubscriber_function_name       = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_function_name
#   avl_consumer_subscriptions_invoke_arn         = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_invoke_arn
#   avl_consumer_subscriptions_function_name      = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_function_name
#   siri_sx_downloader_invoke_arn                 = module.integrated_data_cancellations_pipeline.siri_sx_downloader_invoke_arn
#   siri_sx_downloader_function_name              = module.integrated_data_cancellations_pipeline.siri_sx_downloader_function_name
#   gtfs_downloader_invoke_arn                    = module.integrated_data_gtfs_downloader.gtfs_downloader_invoke_arn
#   gtfs_downloader_lambda_name                   = module.integrated_data_gtfs_downloader.gtfs_downloader_lambda_name
#   gtfs_region_retriever_invoke_arn              = module.integrated_data_gtfs_downloader.gtfs_region_retriever_invoke_arn
#   gtfs_region_retriever_lambda_name             = module.integrated_data_gtfs_downloader.gtfs_region_retriever_lambda_name
#   gtfs_rt_downloader_invoke_arn                 = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_invoke_arn
#   gtfs_rt_downloader_lambda_name                = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_lambda_name
#   gtfs_rt_service_alerts_downloader_invoke_arn  = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_invoke_arn
#   gtfs_rt_service_alerts_downloader_lambda_name = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_lambda_name
# }

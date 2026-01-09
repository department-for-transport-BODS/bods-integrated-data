terraform {
  required_version = ">= 1.6.6"

  backend "s3" {
    bucket = "integrated-data-tfstate-test"
    key    = "terraform.tfstate"
    region = "eu-west-2"

    dynamodb_table = "integrated-data-state-lock-test"
    encrypt        = true
  }

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
  env     = "test"
  secrets = jsondecode(data.sops_file.secrets.raw)
}

module "integrated_data_monitoring" {
  source = "../modules/monitoring"

  environment     = local.env
  email_addresses = local.secrets["email_addresses_for_alarms"]
}

module "integrated_data_api_gateway_account" {
  source = "../modules/api-gateway-account"
}

module "integrated_data_vpc" {
  source = "../modules/networking/vpc"

  environment = local.env
  region      = data.aws_region.current.name
}

module "integrated_data_route53" {
  source = "../modules/networking/route-53"

  environment = local.env
  vpc_id      = module.integrated_data_vpc.vpc_id
  root_domain = local.secrets["root_domain"]
}

module "integrated_data_acm" {
  source = "../modules/networking/acm"

  hosted_zone_id = module.integrated_data_route53.public_hosted_zone_id
  domain_name    = module.integrated_data_route53.public_hosted_zone_name
}

module "integrated_data_aurora_db" {
  source = "../modules/database/aurora-db"

  environment              = local.env
  db_subnet_ids            = module.integrated_data_vpc.db_subnet_ids
  vpc_id                   = module.integrated_data_vpc.vpc_id
  private_hosted_zone_id   = module.integrated_data_route53.private_hosted_zone_id
  private_hosted_zone_name = module.integrated_data_route53.private_hosted_zone_name
  multi_az                 = false
  instance_class           = "db.r6g.xlarge"
  db_engine_version        = "16.8"
}

module "integrated_data_db_monitoring" {
  source = "../modules/database/monitoring"

  environment     = local.env
  db_cluster_id   = module.integrated_data_aurora_db.db_cluster_id
  alarm_topic_arn = module.integrated_data_monitoring.alarm_topic_arn
  ok_topic_arn    = module.integrated_data_monitoring.ok_topic_arn
}

module "integrated_data_bastion_host" {
  source = "../modules/database/bastion-host"

  environment        = local.env
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  vpc_id             = module.integrated_data_vpc.vpc_id
  vpc_cidr           = module.integrated_data_vpc.vpc_cidr
}

module "integrated_data_db_migrator" {
  source = "../modules/database/db-migrator"

  environment        = local.env
  vpc_id             = module.integrated_data_vpc.vpc_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  db_host            = module.integrated_data_aurora_db.db_host
}

module "integrated_data_noc_pipeline" {
  source = "../modules/data-pipelines/noc-pipeline"

  environment        = local.env
  vpc_id             = module.integrated_data_vpc.vpc_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  db_host            = module.integrated_data_aurora_db.db_host
}

module "integrated_data_table_renamer" {
  source = "../modules/table-renamer"

  environment        = local.env
  vpc_id             = module.integrated_data_vpc.vpc_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  db_host            = module.integrated_data_aurora_db.db_host
}

module "integrated_data_naptan_pipeline" {
  source = "../modules/data-pipelines/naptan-pipeline"

  environment        = local.env
  vpc_id             = module.integrated_data_vpc.vpc_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  db_host            = module.integrated_data_aurora_db.db_host
}

module "integrated_data_bods_netex_pipeline" {
  source = "../modules/data-pipelines/netex-pipeline"

  environment = local.env
}

module "integrated_data_nptg_pipeline" {
  source = "../modules/data-pipelines/nptg-pipeline"

  environment        = local.env
  vpc_id             = module.integrated_data_vpc.vpc_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  db_host            = module.integrated_data_aurora_db.db_host
}

module "integrated_data_txc_pipeline" {
  source = "../modules/data-pipelines/txc-pipeline"

  environment               = local.env
  vpc_id                    = module.integrated_data_vpc.vpc_id
  private_subnet_ids        = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn             = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id                  = module.integrated_data_aurora_db.db_sg_id
  db_host                   = module.integrated_data_aurora_db.db_host
  aws_account_id            = data.aws_caller_identity.current.account_id
  aws_region                = data.aws_region.current.name
  tnds_ftp_credentials      = local.secrets["tnds_ftp"]
  rds_output_bucket_name    = module.integrated_data_aurora_db.s3_output_bucket_name
  bank_holidays_bucket_name = module.integrated_data_bank_holidays_pipeline.bank_holidays_bucket_name
  tfl_txc_bucket_name       = module.integrated_data_tfl_pipeline.tfl_txc_bucket_name
}

module "integrated_data_gtfs_downloader" {
  source = "../modules/gtfs-downloader"

  environment      = local.env
  gtfs_bucket_name = module.integrated_data_txc_pipeline.gtfs_timetables_bucket_name
}

module "integrated_data_gtfs_rt_pipeline" {
  source = "../modules/data-pipelines/gtfs-rt-pipeline"

  environment                        = local.env
  vpc_id                             = module.integrated_data_vpc.vpc_id
  private_subnet_ids                 = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn                      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id                           = module.integrated_data_aurora_db.db_sg_id
  db_reader_host                     = module.integrated_data_aurora_db.db_reader_host
  gtfs_rt_service_alerts_bucket_arn  = module.integrated_data_disruptions_pipeline.disruptions_gtfs_rt_bucket_arn
  gtfs_rt_service_alerts_bucket_name = module.integrated_data_disruptions_pipeline.disruptions_gtfs_rt_bucket_name
  enable_cancellations               = true
}

module "integrated_data_avl_pipeline" {
  source = "../modules/data-pipelines/avl-pipeline"

  environment                                 = local.env
  vpc_id                                      = module.integrated_data_vpc.vpc_id
  private_subnet_ids                          = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn                               = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id                                    = module.integrated_data_aurora_db.db_sg_id
  db_host                                     = module.integrated_data_aurora_db.db_host
  db_reader_host                              = module.integrated_data_aurora_db.db_reader_host
  alarm_topic_arn                             = module.integrated_data_monitoring.alarm_topic_arn
  ok_topic_arn                                = module.integrated_data_monitoring.ok_topic_arn
  tfl_api_keys                                = local.secrets["tfl_api_keys"]
  tfl_location_retriever_invoke_every_seconds = 60
  avl_subscription_table_name                 = module.integrated_data_avl_subscription_table.table_name
  aws_account_id                              = data.aws_caller_identity.current.account_id
  aws_region                                  = data.aws_region.current.name
  siri_vm_generator_frequency                 = 30
  avl_validation_error_table_name             = module.integrated_data_avl_validation_error_table.table_name
  gtfs_trip_maps_table_name                   = module.integrated_data_txc_pipeline.gtfs_trip_maps_table_name
  gtfs_rt_bucket_name                         = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_bucket_name
  gtfs_rt_bucket_arn                          = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_bucket_arn
  save_json                                   = true
  abods_account_ids                           = local.secrets["abods_account_ids"]
  enable_cancellations                        = true
}

module "integrated_data_avl_subscription_table" {
  source = "../modules/shared/dynamo-table"

  environment = local.env
  table_name  = "integrated-data-avl-subscription-table"
}

module "integrated_data_avl_validation_error_table" {
  source = "../modules/shared/dynamo-table"

  environment   = local.env
  table_name    = "integrated-data-avl-validation-error-table"
  ttl_attribute = "timeToExist"
}

module "integrated_data_mock_data_producer_api" {
  source = "../modules/mock-data-producer-api"

  environment                           = local.env
  aws_account_id                        = data.aws_caller_identity.current.account_id
  aws_region                            = data.aws_region.current.name
  avl_consumer_data_endpoint            = "https://${module.integrated_data_avl_data_producer_api.endpoint}/subscriptions"
  avl_subscription_table_name           = module.integrated_data_avl_subscription_table.table_name
  cancellations_consumer_data_endpoint  = "https://${module.integrated_data_cancellations_data_producer_api.endpoint}/subscriptions"
  cancellations_subscription_table_name = module.integrated_data_cancellations_data_producer_api.subscriptions_table_name
}

module "integrated_data_avl_data_producer_api" {
  source                          = "../modules/avl-producer-api"
  avl_raw_siri_bucket_name        = module.integrated_data_avl_pipeline.avl_raw_siri_bucket_name
  avl_subscription_table_name     = module.integrated_data_avl_subscription_table.table_name
  aws_account_id                  = data.aws_caller_identity.current.account_id
  aws_region                      = data.aws_region.current.name
  environment                     = local.env
  sg_id                           = module.integrated_data_vpc.default_sg_id
  acm_certificate_arn             = module.integrated_data_acm.acm_certificate_arn
  hosted_zone_id                  = module.integrated_data_route53.public_hosted_zone_id
  domain                          = module.integrated_data_route53.public_hosted_zone_name
  subnet_ids                      = module.integrated_data_vpc.private_subnet_ids
  avl_producer_api_key            = local.secrets["avl_producer_api_key"]
  avl_error_table_name            = module.integrated_data_avl_validation_error_table.table_name
  mock_data_producer_api_endpoint = module.integrated_data_mock_data_producer_api.endpoint
}

module "integrated_data_bank_holidays_pipeline" {
  source = "../modules/data-pipelines/bank-holidays-pipeline"

  environment = local.env
}

module "integrated_data_tfl_pipeline" {
  source = "../modules/data-pipelines/tfl-pipeline"

  environment               = local.env
  vpc_id                    = module.integrated_data_vpc.vpc_id
  private_subnet_ids        = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn             = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id                  = module.integrated_data_aurora_db.db_sg_id
  db_host                   = module.integrated_data_aurora_db.db_host
  bank_holidays_bucket_name = module.integrated_data_bank_holidays_pipeline.bank_holidays_bucket_name
}

module "integrated_data_disruptions_pipeline" {
  source = "../modules/data-pipelines/disruptions-pipeline"

  environment        = local.env
  vpc_id             = module.integrated_data_vpc.vpc_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  db_host            = module.integrated_data_aurora_db.db_host
  retriever_schedule = "rate(5 minutes)"
  save_json          = true
}


module "integrated_data_db_cleardown_function" {
  source = "../modules/db-cleardown"

  environment        = local.env
  vpc_id             = module.integrated_data_vpc.vpc_id
  private_subnet_ids = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn      = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id           = module.integrated_data_aurora_db.db_sg_id
  db_host            = module.integrated_data_aurora_db.db_host
}

module "integrated_data_timetables_sfn" {
  source = "../modules/timetables-sfn"

  environment                                             = local.env
  bods_txc_retriever_function_arn                         = module.integrated_data_txc_pipeline.bods_txc_retriever_function_arn
  tnds_txc_retriever_function_arn                         = module.integrated_data_txc_pipeline.tnds_txc_retriever_function_arn
  txc_processor_function_arn                              = module.integrated_data_txc_pipeline.txc_processor_function_arn
  unzipper_function_arn                                   = module.integrated_data_txc_pipeline.unzipper_function_arn
  gtfs_timetables_trip_table_creator_function_arn         = module.integrated_data_txc_pipeline.gtfs_timetables_trip_table_creator_function_arn
  gtfs_timetables_england_trip_table_creator_function_arn = module.integrated_data_txc_pipeline.gtfs_timetables_england_trip_table_creator_function_arn
  gtfs_timetables_generator_function_arn                  = module.integrated_data_txc_pipeline.gtfs_timetables_generator_function_arn
  gtfs_timetables_zipper_function_arn                     = module.integrated_data_txc_pipeline.gtfs_timetables_zipper_function_arn
  gtfs_timetables_trip_mapper_function_arn                = module.integrated_data_txc_pipeline.gtfs_timetables_trip_mapper_function_arn
  naptan_retriever_function_arn                           = module.integrated_data_naptan_pipeline.naptan_retriever_function_arn
  naptan_uploader_function_arn                            = module.integrated_data_naptan_pipeline.naptan_uploader_function_arn
  noc_retriever_function_arn                              = module.integrated_data_noc_pipeline.noc_retriever_function_arn
  noc_processor_function_arn                              = module.integrated_data_noc_pipeline.noc_processor_function_arn
  nptg_retriever_function_arn                             = module.integrated_data_nptg_pipeline.nptg_retriever_function_arn
  nptg_uploader_function_arn                              = module.integrated_data_nptg_pipeline.nptg_uploader_function_arn
  bank_holidays_retriever_function_arn                    = module.integrated_data_bank_holidays_pipeline.bank_holidays_retriever_function_arn
  db_cleardown_function_arn                               = module.integrated_data_db_cleardown_function.db_cleardown_function_arn
  table_renamer_function_arn                              = module.integrated_data_table_renamer.table_renamer_function_arn
  tnds_txc_zipped_bucket_name                             = module.integrated_data_txc_pipeline.tnds_txc_zipped_bucket_name
  bods_txc_zipped_bucket_name                             = module.integrated_data_txc_pipeline.bods_txc_zipped_bucket_name
  bods_txc_bucket_name                                    = module.integrated_data_txc_pipeline.bods_txc_bucket_name
  tfl_txc_bucket_name                                     = module.integrated_data_tfl_pipeline.tfl_txc_bucket_name
  tnds_txc_bucket_name                                    = module.integrated_data_txc_pipeline.tnds_txc_bucket_name
  noc_bucket_name                                         = module.integrated_data_noc_pipeline.noc_bucket_name
  naptan_bucket_name                                      = module.integrated_data_naptan_pipeline.naptan_bucket_name
  nptg_bucket_name                                        = module.integrated_data_nptg_pipeline.nptg_bucket_name
  bods_netex_retriever_function_arn                       = module.integrated_data_bods_netex_pipeline.bods_netex_retriever_function_arn
  bods_netex_unzipper_function_arn                        = module.integrated_data_bods_netex_pipeline.bods_netex_unzipper_function_arn
  bods_netex_zipped_bucket_name                           = module.integrated_data_bods_netex_pipeline.bods_netex_zipped_bucket_name
  bods_netex_bucket_name                                  = module.integrated_data_bods_netex_pipeline.bods_netex_bucket_name
  schedule                                                = "cron(0 2 * * ? *)"
  tfl_txc_sfn_arn                                         = module.integrated_data_tfl_pipeline.tfl_txc_sfn_arn
  tfl_txc_sfn_name                                        = module.integrated_data_tfl_pipeline.tfl_txc_sfn_name
}
module "integrated_data_cancellations_pipeline" {
  source = "../modules/data-pipelines/cancellations-pipeline"

  environment                           = local.env
  aws_account_id                        = data.aws_caller_identity.current.account_id
  aws_region                            = data.aws_region.current.name
  vpc_id                                = module.integrated_data_vpc.vpc_id
  private_subnet_ids                    = module.integrated_data_vpc.private_subnet_ids
  db_secret_arn                         = module.integrated_data_aurora_db.db_secret_arn
  db_sg_id                              = module.integrated_data_aurora_db.db_sg_id
  db_host                               = module.integrated_data_aurora_db.db_host
  db_reader_host                        = module.integrated_data_aurora_db.db_reader_host
  alarm_topic_arn                       = module.integrated_data_monitoring.alarm_topic_arn
  ok_topic_arn                          = module.integrated_data_monitoring.ok_topic_arn
  cancellations_subscription_table_name = module.integrated_data_cancellations_data_producer_api.subscriptions_table_name
  cancellations_errors_table_name       = module.integrated_data_cancellations_data_producer_api.errors_table_name
  siri_sx_generator_frequency           = 30
}

module "integrated_data_cancellations_data_producer_api" {
  source = "../modules/cancellations-producer-api"

  aws_account_id                     = data.aws_caller_identity.current.account_id
  aws_region                         = data.aws_region.current.name
  environment                        = local.env
  acm_certificate_arn                = module.integrated_data_acm.acm_certificate_arn
  hosted_zone_id                     = module.integrated_data_route53.public_hosted_zone_id
  domain                             = module.integrated_data_route53.public_hosted_zone_name
  cancellations_producer_api_key     = local.secrets["cancellations_producer_api_key"]
  sg_id                              = module.integrated_data_vpc.default_sg_id
  subnet_ids                         = module.integrated_data_vpc.private_subnet_ids
  mock_data_producer_api_endpoint    = module.integrated_data_mock_data_producer_api.endpoint
  cancellations_raw_siri_bucket_name = module.integrated_data_cancellations_pipeline.cancellations_raw_siri_bucket_name
}

module "siri_consumer_api_private" {
  source = "../modules/siri-consumer-api"

  environment                                   = local.env
  aws_region                                    = data.aws_region.current.name
  account_id                                    = data.aws_caller_identity.current.account_id
  api_name                                      = "integrated-data-siri-consumer-api-private"
  private                                       = true
  external_vpces                                = local.secrets["external_vpces_for_siri_consumer_api"]
  siri_vm_downloader_invoke_arn                 = module.integrated_data_avl_pipeline.siri_vm_downloader_invoke_arn
  siri_vm_downloader_function_name              = module.integrated_data_avl_pipeline.siri_vm_downloader_function_name
  siri_vm_stats_invoke_arn                      = module.integrated_data_avl_pipeline.siri_vm_stats_invoke_arn
  siri_vm_stats_function_name                   = module.integrated_data_avl_pipeline.siri_vm_stats_function_name
  avl_consumer_subscriber_invoke_arn            = module.integrated_data_avl_pipeline.avl_consumer_subscriber_invoke_arn
  avl_consumer_subscriber_function_name         = module.integrated_data_avl_pipeline.avl_consumer_subscriber_function_name
  avl_consumer_unsubscriber_invoke_arn          = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_invoke_arn
  avl_consumer_unsubscriber_function_name       = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_function_name
  avl_consumer_subscriptions_invoke_arn         = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_invoke_arn
  avl_consumer_subscriptions_function_name      = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_function_name
  siri_sx_downloader_invoke_arn                 = module.integrated_data_cancellations_pipeline.siri_sx_downloader_invoke_arn
  siri_sx_downloader_function_name              = module.integrated_data_cancellations_pipeline.siri_sx_downloader_function_name
  gtfs_downloader_invoke_arn                    = module.integrated_data_gtfs_downloader.gtfs_downloader_invoke_arn
  gtfs_downloader_lambda_name                   = module.integrated_data_gtfs_downloader.gtfs_downloader_lambda_name
  gtfs_region_retriever_invoke_arn              = module.integrated_data_gtfs_downloader.gtfs_region_retriever_invoke_arn
  gtfs_region_retriever_lambda_name             = module.integrated_data_gtfs_downloader.gtfs_region_retriever_lambda_name
  gtfs_rt_downloader_invoke_arn                 = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_invoke_arn
  gtfs_rt_downloader_lambda_name                = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_lambda_name
  gtfs_rt_service_alerts_downloader_invoke_arn  = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_invoke_arn
  gtfs_rt_service_alerts_downloader_lambda_name = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_lambda_name
}

module "siri_consumer_api_public" {
  source = "../modules/siri-consumer-api"

  environment                                   = local.env
  aws_region                                    = data.aws_region.current.name
  account_id                                    = data.aws_caller_identity.current.account_id
  api_name                                      = "integrated-data-siri-consumer-api-public"
  private                                       = false
  siri_vm_downloader_invoke_arn                 = module.integrated_data_avl_pipeline.siri_vm_downloader_invoke_arn
  siri_vm_downloader_function_name              = module.integrated_data_avl_pipeline.siri_vm_downloader_function_name
  siri_vm_stats_invoke_arn                      = module.integrated_data_avl_pipeline.siri_vm_stats_invoke_arn
  siri_vm_stats_function_name                   = module.integrated_data_avl_pipeline.siri_vm_stats_function_name
  avl_consumer_subscriber_invoke_arn            = module.integrated_data_avl_pipeline.avl_consumer_subscriber_invoke_arn
  avl_consumer_subscriber_function_name         = module.integrated_data_avl_pipeline.avl_consumer_subscriber_function_name
  avl_consumer_unsubscriber_invoke_arn          = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_invoke_arn
  avl_consumer_unsubscriber_function_name       = module.integrated_data_avl_pipeline.avl_consumer_unsubscriber_function_name
  avl_consumer_subscriptions_invoke_arn         = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_invoke_arn
  avl_consumer_subscriptions_function_name      = module.integrated_data_avl_pipeline.avl_consumer_subscriptions_function_name
  siri_sx_downloader_invoke_arn                 = module.integrated_data_cancellations_pipeline.siri_sx_downloader_invoke_arn
  siri_sx_downloader_function_name              = module.integrated_data_cancellations_pipeline.siri_sx_downloader_function_name
  gtfs_downloader_invoke_arn                    = module.integrated_data_gtfs_downloader.gtfs_downloader_invoke_arn
  gtfs_downloader_lambda_name                   = module.integrated_data_gtfs_downloader.gtfs_downloader_lambda_name
  gtfs_region_retriever_invoke_arn              = module.integrated_data_gtfs_downloader.gtfs_region_retriever_invoke_arn
  gtfs_region_retriever_lambda_name             = module.integrated_data_gtfs_downloader.gtfs_region_retriever_lambda_name
  gtfs_rt_downloader_invoke_arn                 = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_invoke_arn
  gtfs_rt_downloader_lambda_name                = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_downloader_lambda_name
  gtfs_rt_service_alerts_downloader_invoke_arn  = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_invoke_arn
  gtfs_rt_service_alerts_downloader_lambda_name = module.integrated_data_gtfs_rt_pipeline.gtfs_rt_service_alerts_downloader_lambda_name
}

module "integrated_data_txc_analysis" {
  source = "../modules/txc-analysis"

  environment          = local.env
  aws_account_id       = data.aws_caller_identity.current.account_id
  aws_region           = data.aws_region.current.name
  bods_txc_bucket_name = module.integrated_data_txc_pipeline.bods_txc_bucket_name
  tnds_txc_bucket_name = module.integrated_data_txc_pipeline.tnds_txc_bucket_name
  naptan_bucket_name   = module.integrated_data_naptan_pipeline.naptan_bucket_name
  nptg_bucket_name     = module.integrated_data_nptg_pipeline.nptg_bucket_name
}

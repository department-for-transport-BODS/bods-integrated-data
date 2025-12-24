NAPTAN_BUCKET_NAME="integrated-data-naptan-stops-local"
BODS_NETEX_BUCKET_NAME="integrated-data-bods-netex-local"
BODS_NETEX_ZIPPED_BUCKET_NAME="integrated-data-bods-netex-zipped-local"
NPTG_BUCKET_NAME="integrated-data-nptg-local"
BODS_TXC_ZIPPED_BUCKET_NAME="integrated-data-bods-txc-zipped-local"
BODS_TXC_UNZIPPED_BUCKET_NAME="integrated-data-bods-txc-local"
TNDS_TXC_ZIPPED_BUCKET_NAME="integrated-data-tnds-txc-zipped-local"
TNDS_TXC_UNZIPPED_BUCKET_NAME="integrated-data-tnds-txc-local"
TNDS_FTP_ARN=""
AVL_UNPROCESSED_SIRI_BUCKET_NAME="integrated-data-avl-raw-siri-vm-local"
AVL_SUBSCRIPTION_TABLE_NAME="integrated-data-avl-subscription-table-local"
AVL_VALIDATION_ERROR_TABLE_NAME="integrated-data-avl-validation-error-table-local"
AVL_SIRI_VM_DOWNLOADER_INPUT="{}"
AVL_GENERATED_SIRI_VM_BUCKET_NAME="integrated-data-avl-generated-siri-vm-local"
GTFS_ZIPPED_BUCKET_NAME="integrated-data-gtfs-local"
GTFS_RT_BUCKET_NAME="integrated-data-gtfs-rt-local"
GTFS_TRIP_MAPS_TABLE_NAME="integrated-data-gtfs-trip-maps-local"
TFL_TIMETABLE_ZIPPED_BUCKET_NAME="integrated-data-tfl-timetable-zipped-local"
TFL_TIMETABLE_UNZIPPED_BUCKET_NAME="integrated-data-tfl-timetable-local"
NOC_BUCKET_NAME="integrated-data-noc-local"
TXC_QUEUE_NAME="integrated-data-txc-queue-local"
AURORA_OUTPUT_BUCKET_NAME="integrated-data-aurora-output-local"
BANK_HOLIDAYS_BUCKET_NAME="integrated-data-bank-holidays-local"
BODS_DISRUPTIONS_UNZIPPED_BUCKET_NAME="integrated-data-bods-disruptions-unzipped-local"
BODS_DISRUPTIONS_BUCKET_NAME="integrated-data-bods-disruptions-gtfs-rt-local"
TFL_TXC_BUCKET_NAME="integrated-data-tfl-txc-local"
GTFS_RT_DOWNLOADER_INPUT="{}"
TFL_API_ARN=""
AVL_CONSUMER_API_KEY_ARN=""
AVL_PRODUCER_API_KEY_ARN=""
AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME="integrated-data-avl-consumer-subscription-table-local"
CANCELLATIONS_SUBSCRIPTION_TABLE_NAME="integrated-data-cancellations-subscription-table-local"

# Dev

setup: install-deps build-functions dev-containers-up create-local-env migrate-local-db-to-latest

asdf:
	asdf plugin add pnpm && \
	asdf plugin add awscli && \
	asdf plugin add terraform https://github.com/asdf-community/asdf-hashicorp.git && \
	asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git && \
	asdf plugin-add sops https://github.com/feniix/asdf-sops.git && \
	asdf install

dev-containers-up:
	docker compose --project-directory dev up -d

dev-containers-down:
	docker compose --project-directory dev down

dev-containers-kill:
	docker compose --project-directory dev kill

dev-containers-stop-%:
	docker compose --project-directory dev stop $*

# Terraform

tf-init-%:
	terraform -chdir=terraform/$* init

tf-plan-%:
	terraform -chdir=terraform/$* plan

tf-apply-%:
	terraform -chdir=terraform/$* apply

tf-fmt:
	terraform -chdir=terraform fmt -recursive

tf-fmt-check:
	terraform -chdir=terraform fmt -recursive -check

# Terraform local

tf-init-local:
	tflocal -chdir=terraform/local init

tf-plan-local:
	tflocal -chdir=terraform/local plan

tf-apply-local:
	tflocal -chdir=terraform/local apply

create-local-env:
	tflocal -chdir=terraform/local init && \
	tflocal -chdir=terraform/local apply --auto-approve

# Build

install-deps:
	pnpm i && \
	(cd src && pnpm i) && \
	(cd cli-helpers && pnpm i) && \
	(cd integration-testing && pnpm i)

build-functions:
	cd src && pnpm build-all

build-function-%:
	cd src/functions/$* && pnpm build:local

lint-functions:
	pnpm lint

lint-functions-with-fix:
	pnpm lint:fix

test-functions:
	cd src && pnpm test:ci

docker-build-%:
	docker build --platform=linux/arm64 --provenance false --file src/Dockerfile.lambda --build-arg SERVICE_NAME=$* -t $*:latest src/functions/dist

check-types:
	cd src && pnpm run check-types

run-integration-tests-%:
	cd integration-testing && pnpm run test:$*

# CLI helpers

command-%:
	npx tsx cli-helpers/src/commands/$* ${FLAGS};

# Secrets

edit-secrets-%:
	cd terraform/$* && sops secrets.enc.json

# Database

migrate-local-db-to-latest:
	STAGE=local npx tsx -e "import {handler} from './src/functions/db-migrator'; handler().catch(e => console.error(e))"

rollback-last-local-db-migration:
	STAGE=local ROLLBACK=true npx tsx -e "import {handler} from './src/functions/db-migrator'; handler().catch(e => console.error(e))"

get-db-credentials:
	./scripts/get-db-credentials.sh

bastion-tunnel:
	./scripts/bastion-tunnel.sh

make bastion-tunnel-with-password: get-db-credentials bastion-tunnel

# Naptan

run-local-naptan-retriever:
	STAGE=local BUCKET_NAME=${NAPTAN_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/naptan-retriever'; handler().catch(e => console.error(e))"

run-local-naptan-uploader:
	STAGE=local npx tsx -e "import {handler} from './src/functions/naptan-uploader'; handler({Records:[{s3:{bucket:{name:'${NAPTAN_BUCKET_NAME}'},object:{key:'Stops.csv'}}}]}).catch(e => console.error(e))"

# NeTEx

run-local-bods-netex-retriever:
	STAGE=local BUCKET_NAME=${BODS_NETEX_BUCKET_NAME} ZIPPED_BUCKET_NAME=${BODS_NETEX_ZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/bods-netex-retriever'; handler().catch(console.error)"

run-local-bods-netex-unzipper:
	STAGE=local FILE="${FILE}" UNZIPPED_BUCKET_NAME=${BODS_NETEX_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/bods-netex-unzipper'; handler({Records:[{s3:{bucket:{name:'${BODS_NETEX_ZIPPED_BUCKET_NAME}'},object:{key:\"${FILE}\"}}}]}).catch(console.error)"

# NPTG

run-local-nptg-retriever:
	STAGE=local BUCKET_NAME=${NPTG_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/nptg-retriever'; handler().catch(e => console.error(e))"

run-local-nptg-uploader:
	STAGE=local npx tsx -e "import {handler} from './src/functions/nptg-uploader'; handler({Records:[{s3:{bucket:{name:'${NPTG_BUCKET_NAME}'},object:{key:'NPTG.xml'}}}]}).catch(e => console.error(e))"

# TXC

run-local-bods-txc-retriever:
	STAGE=local TXC_ZIPPED_BUCKET_NAME=${BODS_TXC_ZIPPED_BUCKET_NAME} TXC_BUCKET_NAME=${BODS_TXC_UNZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/bods-txc-retriever'; handler().catch(e => console.error(e))"

run-local-tnds-txc-retriever:
	STAGE=local TXC_ZIPPED_BUCKET_NAME=${TNDS_TXC_ZIPPED_BUCKET_NAME} TNDS_FTP_ARN=${TNDS_FTP_ARN} npx tsx -e "import {handler} from './src/functions/tnds-txc-retriever'; handler().catch(e => console.error(e))"

run-local-db-cleardown:
	STAGE=local npx tsx -e "import {handler} from './src/functions/db-cleardown'; handler().catch(e => console.error(e))"

run-local-db-cleardown-gtfs-only:
	STAGE=local ONLY_GTFS=true npx tsx -e "import {handler} from './src/functions/db-cleardown'; handler().catch(e => console.error(e))"

run-local-bods-txc-unzipper:
	STAGE=local FILE="${FILE}" UNZIPPED_BUCKET_NAME=${BODS_TXC_UNZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/unzipper'; handler({Records:[{s3:{bucket:{name:'${BODS_TXC_ZIPPED_BUCKET_NAME}'},object:{key:\"${FILE}\"}}}]}).catch(e => console.error(e))"

run-local-tnds-txc-unzipper:
	STAGE=local FILE="${FILE}" UNZIPPED_BUCKET_NAME=${TNDS_TXC_UNZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/unzipper'; handler({Records:[{s3:{bucket:{name:'${TNDS_TXC_ZIPPED_BUCKET_NAME}'},object:{key:\"${FILE}\"}}}]}).catch(e => console.error(e))"

run-local-bods-txc-processor:
	STAGE=local FILE="${FILE}" BANK_HOLIDAYS_BUCKET_NAME=${BANK_HOLIDAYS_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/txc-processor'; handler({Records:[{s3:{bucket:{name:'${BODS_TXC_UNZIPPED_BUCKET_NAME}'},object:{key:\"${FILE}\"}}}]}).catch(e => console.error(e))"

run-local-tnds-txc-processor:
	STAGE=local FILE="${FILE}" BANK_HOLIDAYS_BUCKET_NAME=${BANK_HOLIDAYS_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/txc-processor'; handler({Records:[{s3:{bucket:{name:'${TNDS_TXC_UNZIPPED_BUCKET_NAME}'},object:{key:\"${FILE}\"}}}]}).catch(e => console.error(e))"

# TfL

run-local-tfl-timetable-retriever:
	STAGE=local TFL_TIMETABLE_ZIPPED_BUCKET_NAME="${TFL_TIMETABLE_ZIPPED_BUCKET_NAME}" npx tsx -e "import {handler} from './src/functions/tfl-timetable-retriever'; handler().then(console.log).catch(console.error)"

run-local-tfl-timetable-unzipper:
	STAGE=local FILE="${FILE}" UNZIPPED_BUCKET_NAME=${TFL_TIMETABLE_UNZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/tfl-timetable-unzipper'; handler({Records:[{s3:{bucket:{name:'${TFL_TIMETABLE_ZIPPED_BUCKET_NAME}'},object:{key:\"${FILE}\"}}}]}).catch(console.error)"

run-local-tfl-timetable-processor:
	STAGE=local FILE="${FILE}" npx tsx -e "import {handler} from './src/functions/tfl-timetable-processor'; handler({Records:[{s3:{bucket:{name:'${TFL_TIMETABLE_UNZIPPED_BUCKET_NAME}'},object:{key:\"${FILE}\"}}}]}).catch(console.error)"

run-local-tfl-txc-generator:
	STAGE=local LINE_ID="${LINE_ID}" TFL_TXC_BUCKET_NAME=${TFL_TXC_BUCKET_NAME} BANK_HOLIDAYS_BUCKET_NAME=${BANK_HOLIDAYS_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/tfl-txc-generator'; handler({lineId:'${LINE_ID}'}).catch(console.error)"

# GTFS

run-local-gtfs-timetables-generator:
	STAGE=local OUTPUT_BUCKET=${AURORA_OUTPUT_BUCKET_NAME} GTFS_BUCKET=${GTFS_ZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/gtfs-timetables-generator'; handler().catch(e => console.error(e))"

run-local-gtfs-timetables-trip-mapper:
	STAGE=local GTFS_TRIP_MAPS_TABLE_NAME=${GTFS_TRIP_MAPS_TABLE_NAME} npx tsx -e "import {handler} from './src/functions/gtfs-timetables-trip-mapper'; handler().then(console.log).catch(console.error)"

run-local-gtfs-downloader:
	STAGE=local BUCKET_NAME=${GTFS_ZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/gtfs-downloader'; handler().then((response) => console.log(response)).catch(e => console.error(e))"

# example usage with query params: make run-local-gtfs-rt-downloader GTFS_RT_DOWNLOADER_INPUT="{ queryStringParameters: { routeId: '1,2', startTimeAfter: 1712288820 } }"
run-local-gtfs-rt-downloader:
	STAGE=local BUCKET_NAME=${GTFS_RT_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/gtfs-rt-downloader'; handler(${GTFS_RT_DOWNLOADER_INPUT}).then(r => console.log(r)).catch(e => console.error(e))"

# AVL

run-local-avl-subscriber:
	STAGE=local TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} AVL_PRODUCER_API_KEY_ARN=${AVL_PRODUCER_API_KEY_ARN} npx tsx -e "import {handler} from './src/functions/avl-subscriber'; handler({body: '\{\"dataProducerEndpoint\":\"http://ee7swjlq51jq0ri51nl3hlexwdleoc8n.lambda-url.eu-west-2.localhost.localstack.cloud:4566\",\"description\":\"description\",\"shortDescription\":\"shortDescription\",\"username\":\"test-user\",\"password\":\"dummy-password\"\}' }).catch(e => console.error(e))"

run-local-avl-data-endpoint:
	STAGE=local SUBSCRIPTION_ID=${SUBSCRIPTION_ID} FILE="${FILE}" BUCKET_NAME=${AVL_UNPROCESSED_SIRI_BUCKET_NAME} TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} npx tsx -e "import {handler} from './src/functions/avl-data-endpoint'; handler({body: '$(shell cat ${FILE} | sed -e 's/\"/\\"/g')', pathParameters: { subscriptionId:'${SUBSCRIPTION_ID}'}}).catch(e => console.error(e))"

run-local-avl-processor:
	STAGE=local AVL_SUBSCRIPTION_TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} AVL_VALIDATION_ERROR_TABLE_NAME=${AVL_VALIDATION_ERROR_TABLE_NAME} GTFS_TRIP_MAPS_TABLE_NAME=${GTFS_TRIP_MAPS_TABLE_NAME} FILE="${FILE}" npx tsx -e "import {handler} from './src/functions/avl-processor'; handler({Records:[{body:'{\"Records\":[{\"s3\":{\"bucket\":{\"name\":\"${AVL_UNPROCESSED_SIRI_BUCKET_NAME}\"},\"object\":{\"key\":\"${FILE}\"}}}]}'}]}).catch(e => console.error(e))"

run-local-avl-retriever:
	STAGE=local TARGET_BUCKET_NAME=${AVL_UNPROCESSED_SIRI_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/avl-retriever'; handler().catch(e => console.error(e))"

run-local-avl-mock-data-producer-subscribe:
	STAGE=local npx tsx -e "import {handler} from './src/functions/avl-mock-data-producer-subscribe'; handler().catch(e => console.error(e))"

run-local-mock-data-producer-send-data:
	STAGE=local AVL_DATA_ENDPOINT="https://www.local.com" CANCELLATIONS_DATA_ENDPOINT="https://www.local.com" AVL_TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} CANCELLATIONS_TABLE_NAME=${CANCELLATIONS_SUBSCRIPTION_TABLE_NAME} npx tsx -e "import {handler} from './src/functions/mock-data-producer-send-data'; handler().catch(e => console.error(e))"

run-local-avl-mock-data-receiver:
	STAGE=local npx tsx -e "import {handler} from './src/functions/avl-mock-data-receiver'; handler({ body: ${BODY} }).catch(console.error)"

run-local-avl-unsubscriber:
	STAGE=local SUBSCRIPTION_ID="${SUBSCRIPTION_ID}" STAGE="local" TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} AVL_PRODUCER_API_KEY_ARN=${AVL_PRODUCER_API_KEY_ARN} npx tsx -e "import {handler} from './src/functions/avl-unsubscriber'; handler({pathParameters: {'subscriptionId':'${SUBSCRIPTION_ID}'} }).catch(e => console.error(e))"

run-local-avl-tfl-line-id-retriever:
	STAGE=local npx tsx -e "import {handler} from './src/functions/avl-tfl-line-id-retriever'; handler().catch(e => console.error(e))"

run-local-avl-tfl-location-retriever:
	STAGE=local TFL_API_ARN=${TFL_API_ARN} npx tsx -e "import {handler} from './src/functions/avl-tfl-location-retriever'; handler().catch(e => console.error(e))"

run-local-avl-subscriptions:
	STAGE=local TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} AVL_PRODUCER_API_KEY_ARN=${AVL_PRODUCER_API_KEY_ARN} npx tsx -e "import {handler} from './src/functions/avl-subscriptions'; handler({}).then(console.log).catch(console.error)"

run-local-avl-subscription:
	STAGE=local TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} AVL_PRODUCER_API_KEY_ARN=${AVL_PRODUCER_API_KEY_ARN} SUBSCRIPTION_ID="${SUBSCRIPTION_ID}" npx tsx -e "import {handler} from './src/functions/avl-subscriptions'; handler({ pathParameters: { subscriptionId: '${SUBSCRIPTION_ID}' }}).then(console.log).catch(console.error)"

# Change SUBSCRIPTION_PK, API_KEY, SUBSCRIPTION_ID and FREQUENCY values as and when needed
run-local-avl-consumer-subscriber:
	STAGE=local AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME=${AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME} AVL_PRODUCER_SUBSCRIPTION_TABLE_NAME=${AVL_SUBSCRIPTION_TABLE_NAME} AVL_CONSUMER_SUBSCRIPTION_DATA_SENDER_FUNCTION_ARN=${AVL_CONSUMER_SUBSCRIPTION_DATA_SENDER_FUNCTION_ARN} AVL_CONSUMER_SUBSCRIPTION_TRIGGER_FUNCTION_ARN=${AVL_CONSUMER_SUBSCRIPTION_TRIGGER_FUNCTION_ARN} AVL_CONSUMER_SUBSCRIPTION_SCHEDULE_ROLE_ARN=${AVL_CONSUMER_SUBSCRIPTION_SCHEDULE_ROLE_ARN} ALARM_TOPIC_ARN="stub-alarm-topic-arn" OK_TOPIC_ARN="stub-ok-topic-arn" npx tsx -e "import {handler} from './src/functions/avl-consumer-subscriber'; handler({ headers: { 'x-api-key': '${API_KEY}' }, queryStringParameters: { subscriptionId: '${SUBSCRIPTION_ID}' }, body: '<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Siri version=\"2.0\" xmlns=\"http://www.siri.org.uk/siri\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://www.siri.org.uk/siri http://www.siri.org.uk/schema/2.0/xsd/siri.xsd\"><SubscriptionRequest><RequestTimestamp>2024-03-11T15:20:02.093Z</RequestTimestamp><ConsumerAddress>https://httpstat.us/200</ConsumerAddress><RequestorRef>test</RequestorRef><MessageIdentifier>123</MessageIdentifier><SubscriptionContext><HeartbeatInterval>PT30S</HeartbeatInterval></SubscriptionContext><VehicleMonitoringSubscriptionRequest><SubscriptionIdentifier>${SUBSCRIPTION_PK}</SubscriptionIdentifier><InitialTerminationTime>2034-03-11T15:20:02.093Z</InitialTerminationTime><VehicleMonitoringRequest version=\"2.0\"><RequestTimestamp>2024-03-11T15:20:02.093Z</RequestTimestamp><VehicleMonitoringDetailLevel>normal</VehicleMonitoringDetailLevel></VehicleMonitoringRequest><UpdateInterval>PT${FREQUENCY}S</UpdateInterval></VehicleMonitoringSubscriptionRequest></SubscriptionRequest></Siri>' }).then(console.log).catch(console.error)"

# Change SUBSCRIPTION_PK and API_KEY values as and when needed
run-local-avl-consumer-unsubscriber:
	STAGE=local AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME=${AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME} npx tsx -e "import {handler} from './src/functions/avl-consumer-unsubscriber'; handler({ headers: { 'x-api-key': '${API_KEY}' }, body: '<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Siri version=\"2.0\" xmlns=\"http://www.siri.org.uk/siri\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://www.siri.org.uk/siri http://www.siri.org.uk/schema/2.0/xsd/siri.xsd\"><TerminateSubscriptionRequest><RequestTimestamp>2024-03-11T15:20:02.093Z</RequestTimestamp><RequestorRef>BODS</RequestorRef><MessageIdentifier>1</MessageIdentifier><SubscriptionRef>${SUBSCRIPTION_PK}</SubscriptionRef></TerminateSubscriptionRequest></Siri>' }).then(console.log).catch(console.error)"

# Change SUBSCRIPTION_PK and API_KEY values as and when needed
run-local-avl-consumer-subscriptions:
	STAGE=local AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME=${AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME} npx tsx -e "import {handler} from './src/functions/avl-consumer-subscriptions'; handler({ headers: { 'x-api-key': '${API_KEY}' }, queryStringParameters: { subscriptionId: '${SUBSCRIPTION_PK}' } }).then(console.log).catch(console.error)"

# Change SUBSCRIPTION_PK and API_KEY values as and when needed
run-local-avl-consumer-data-sender:
	STAGE=local AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME=${AVL_CONSUMER_SUBSCRIPTION_TABLE_NAME} npx tsx -e "import {handler} from './src/functions/avl-consumer-data-sender'; handler({ Records: [{ body: '{ \"subscriptionPK\": \"${SUBSCRIPTION_PK}\", \"SK\": \"${API_KEY}\" }' }] }).then(console.log).catch(console.error)"

# Change SUBSCRIPTION_PK, API_KEY, QUEUE_URL and FREQUENCY values as and when needed
run-local-avl-consumer-subscription-trigger:
	STAGE=local npx tsx -e "import {handler} from './src/functions/avl-consumer-subscription-trigger'; handler({ subscriptionPK: '${SUBSCRIPTION_PK}', SK: '${API_KEY}', queueUrl: '${QUEUE_URL}', frequencyInSeconds: ${FREQUENCY} }).then(console.log).catch(console.error)"

# NOC

run-local-noc-retriever:
	STAGE=local NOC_BUCKET_NAME=${NOC_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/noc-retriever'; handler().catch(e => console.error(e))"

run-local-noc-processor:
	STAGE=local npx tsx -e "import {handler} from './src/functions/noc-processor'; handler({Records:[{s3:{bucket:{name:'${NOC_BUCKET_NAME}'},object:{key:'noc.xml'}}}]}).catch(e => console.error(e))"

# Table renamer

run-local-table-renamer:
	STAGE=local npx tsx -e "import {handler} from './src/functions/table-renamer'; handler().catch(e => console.error(e))"

# Bank Holidays retriever

run-local-bank-holidays-retriever:
	STAGE=local BANK_HOLIDAYS_BUCKET_NAME=${BANK_HOLIDAYS_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/bank-holidays-retriever'; handler().catch(e => console.error(e))"

# Disruptions

run-local-bods-disruptions-retriever:
	STAGE=local DISRUPTIONS_UNZIPPED_BUCKET_NAME=${BODS_DISRUPTIONS_UNZIPPED_BUCKET_NAME} npx tsx -e "import {handler} from './src/functions/bods-disruptions-retriever'; handler().catch(console.error)"

run-local-bods-disruptions-processor:
	STAGE=local BUCKET_NAME=${BODS_DISRUPTIONS_BUCKET_NAME} SAVE_JSON=true npx tsx -e "import {handler} from './src/functions/bods-disruptions-processor'; handler({Records:[{s3:{bucket:{name:'${BODS_DISRUPTIONS_UNZIPPED_BUCKET_NAME}'},object:{key:'disruptions/sirisx.xml'}}}]}).catch(console.error)"

# Cancellations

run-local-cancellations-siri-sx-downloader:
	STAGE=local BUCKET_NAME="integrated-data-cancellations-generated-siri-sx-local" npx tsx -e "import {handler} from './src/functions/cancellations-siri-sx-downloader'; handler({ queryStringParameters: { subscriptionId: '${SUBSCRIPTION_ID}' } }).then(console.log).catch(console.error)"

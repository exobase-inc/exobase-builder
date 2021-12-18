# Not all regions are supported for functions so
# were not using us-west2 like resto of Kudos
CLOUD_RUN_REGION := us-central1
PROJECT_ID := exobase
IMAGE_NAME := exobase-builder
VERSION := `grep version package.json | sed 's/.*"version": "\(.*\)".*/\1/'`
IMAGE := gcr.io/${PROJECT_ID}/${IMAGE_NAME}/${VERSION}

queue:
	gcloud tasks queues create exobase-builder-queue

build:
	DOCKER_BUILDKIT=0 docker build --progress=plain -t exobase-builder-${VERSION} -t ${IMAGE} .

run:
	docker run exobase-builder-${VERSION}

push:
	docker push ${IMAGE}

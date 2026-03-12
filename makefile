# Variables
DOCKER_REGISTRY=freeu
SERVER_IMAGE=$(DOCKER_REGISTRY)/lifetrace-server
VERSION=latest

# 包含 .env 文件（如果存在）
-include deploy/.env
export

# Default target - show help
.DEFAULT_GOAL := help

# Build Docker images
build-server:
	@echo "Building Server Docker image: $(SERVER_IMAGE):$(VERSION)..."
	cd server && docker build -t $(SERVER_IMAGE):$(VERSION) .
	@echo "Server Docker image built successfully: $(SERVER_IMAGE):$(VERSION)"


# Docker Compose commands
start:
	@echo "Running server service: $(SERVER_IMAGE):$(VERSION)..."
	cd deploy && docker compose up -d
	@echo "Server service running successfully: $(SERVER_IMAGE):$(VERSION)"

stop:
	@echo "Stopping server service: $(SERVER_IMAGE):$(VERSION)..."
	cd deploy && docker compose down
	@echo "Server service stopped successfully: $(SERVER_IMAGE):$(VERSION)"

logs:
	@echo "Viewing logs for server service: $(SERVER_IMAGE):$(VERSION)..."
	cd deploy && docker compose logs -f

restart: stop start logs

deploy: build-server restart

# Help target
help:
	@echo "Docker Build Targets:"
	@echo "  make build-server   - Build server Docker image"
	@echo "Docker Compose Targets:"
	@echo "  make start          - Start server service with docker compose"
	@echo "  make stop           - Stop server service"
	@echo "  make logs           - View logs for server service"
	@echo "  make restart        - Restart server service"
	@echo "  make deploy         - Build and deploy server service"

# Phony targets
.PHONY: build-server start stop logs restart deploy help

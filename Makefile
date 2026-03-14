APP_NAME := blast-mail
MODULE := github.com/zbum/manty-blast-mail
DIST := dist

.PHONY: all build frontend backend clean test lint fmt run dev-frontend dev-backend build-all

all: frontend backend

frontend:
	cd web && npm install && npm run build

backend:
	go build -o $(DIST)/$(APP_NAME) ./cmd/server

build: all

build-all: frontend
	GOOS=linux GOARCH=amd64 go build -o $(DIST)/$(APP_NAME)-linux-amd64 ./cmd/server
	GOOS=linux GOARCH=arm64 go build -o $(DIST)/$(APP_NAME)-linux-arm64 ./cmd/server
	GOOS=darwin GOARCH=amd64 go build -o $(DIST)/$(APP_NAME)-darwin-amd64 ./cmd/server
	GOOS=darwin GOARCH=arm64 go build -o $(DIST)/$(APP_NAME)-darwin-arm64 ./cmd/server
	GOOS=windows GOARCH=amd64 go build -o $(DIST)/$(APP_NAME)-windows-amd64.exe ./cmd/server

clean:
	rm -rf $(DIST)/ web/dist web/node_modules

test:
	go test ./...

lint:
	golangci-lint run ./...

fmt:
	go fmt ./...

run: backend
	./$(DIST)/$(APP_NAME) -config config.yaml

dev-frontend:
	cd web && npm run dev

dev-backend:
	go run ./cmd/server -config config.yaml

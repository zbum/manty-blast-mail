.PHONY: all build frontend backend clean dev

all: frontend backend

frontend:
	cd web && npm install && npm run build

backend:
	go build -o bin/mail-sender ./cmd/server

build: all

clean:
	rm -rf bin/ web/dist web/node_modules

dev-frontend:
	cd web && npm run dev

dev-backend:
	go run ./cmd/server -config config.yaml

run: backend
	./bin/mail-sender -config config.yaml

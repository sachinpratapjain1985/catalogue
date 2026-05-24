# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Express Backend
FROM node:20-alpine AS backend-builder
WORKDIR /backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy compiled backend code
COPY --from=backend-builder /backend/dist ./dist

# Copy compiled frontend assets to backend's public directory
COPY --from=frontend-builder /frontend/dist ./dist/public

# Create directory for uploads
RUN mkdir -p /app/uploads

EXPOSE 5000

ENV PORT=5000
ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads

CMD ["node", "dist/index.js"]

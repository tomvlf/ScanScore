FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN addgroup -S app && adduser -S -G app app
USER app
EXPOSE 8080
CMD ["node","server.js"]

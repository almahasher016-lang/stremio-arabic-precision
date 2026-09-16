FROM node:22.16.0-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]

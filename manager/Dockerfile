FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --only=production

COPY server.js ./
COPY views ./views

EXPOSE 3000

CMD ["npm", "start"]

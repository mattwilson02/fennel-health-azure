FROM node:22-alpine
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
# One container runs the web app and the scheduled jobs together, like the real VM does.
CMD ["sh", "-c", "node jobs/scheduler.js & exec node server.js"]

# Next.js 16 frontend — production image (proxies /api to backend)
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
ARG BACKEND_URL=http://backend:5000
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--port", "3000"]

FROM nginx:1.25-alpine
COPY index.html /usr/share/nginx/html/index.html
COPY logs.html  /usr/share/nginx/html/logs.html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

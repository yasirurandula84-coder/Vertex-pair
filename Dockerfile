FROM node:lts-buster

# ffmpeg සහ අවශ්‍ය tools install කරමු
RUN apt-get update && \
  apt-get install -y \
  ffmpeg \
  imagemagick \
  webp && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies install කරමු
COPY package.json .
RUN npm install

# ඉතිරි files ටික copy කරමු
COPY . .

# Port එක 7860 කරන්න (Hugging Face වල default port එක)
EXPOSE 7860
ENV PORT=7860

CMD ["node", "server.js"]

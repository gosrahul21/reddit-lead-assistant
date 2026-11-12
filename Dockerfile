FROM public.ecr.aws/lambda/nodejs:20

# Install required Amazon Linux 2023 dependencies for headless Chrome
RUN dnf install -y \
    atk \
    cups-libs \
    gtk3 \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXrandr \
    libXScrnSaver \
    libXtst \
    pango \
    alsa-lib \
    tar \
    gzip \
    nss \
    mesa-libgbm \
    && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy project files
COPY . .

# Set Lambda Handler
CMD [ "lambda-worker.handler" ]


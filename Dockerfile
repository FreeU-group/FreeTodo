# base image
FROM python:3.12.10-slim-bookworm AS base

WORKDIR /app

RUN pip install --no-cache-dir uv==0.6.16 -i https://pypi.mirrors.ustc.edu.cn/simple

FROM base AS packages

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml uv.lock ./

RUN uv sync --locked

# production stage
FROM base AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 wget curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

EXPOSE 8000

# Copy Python environment and packages
ENV VIRTUAL_ENV=/app/.venv
COPY --from=packages ${VIRTUAL_ENV} ${VIRTUAL_ENV}
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

# Copy source code
COPY . /app/

CMD ["python", "-m", "lifetrace.server", "--role", "center", "--port", "8001"]

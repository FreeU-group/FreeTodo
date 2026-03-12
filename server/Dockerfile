FROM python:3.12.10-slim-bookworm AS base

WORKDIR /app

RUN pip install --no-cache-dir uv==0.6.16 -i https://pypi.mirrors.ustc.edu.cn/simple

FROM base AS packages

RUN apt update && apt install -y --no-install-recommends \
    gcc g++ libpq-dev libopus-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./
RUN uv sync

# production stage
FROM base AS production

RUN apt update && apt install -y --no-install-recommends \
    libopus0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

EXPOSE 8001

ENV VIRTUAL_ENV=/app/.venv
COPY --from=packages ${VIRTUAL_ENV} ${VIRTUAL_ENV}
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

COPY . /app/

CMD ["python", "server.py"]

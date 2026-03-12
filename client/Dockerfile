FROM python:3.12.10-slim-bookworm AS base

WORKDIR /app

RUN pip install --no-cache-dir uv==0.6.16 -i https://pypi.mirrors.ustc.edu.cn/simple

FROM base AS packages

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN uv sync

FROM base AS production

WORKDIR /app

ENV VIRTUAL_ENV=/app/.venv
COPY --from=packages ${VIRTUAL_ENV} ${VIRTUAL_ENV}
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

COPY . /app/

ENTRYPOINT ["python", "sensor.py"]
CMD ["--center-url", "http://center:8001", "--node-id", "docker-sensor"]

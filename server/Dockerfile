FROM python:3.11-bookworm AS builder

RUN pip install uv==0.7.12

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    POETRY_VIRTUALENVS_CREATE=1 \
    POETRY_CACHE_DIR=/tmp/poetry_cache

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN touch README.md


RUN uv venv && \
    uv sync && \
    rm -rf /root/.cache/uv

FROM python:3.11-slim-bookworm AS runtime

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}

COPY app ./app

EXPOSE 8080

ENTRYPOINT ["python", "-m", "app.main"]
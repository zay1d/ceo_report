FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/ server/
COPY web/ web/
WORKDIR /app/server
RUN useradd -r -u 10001 tcm && mkdir /state && chown tcm /state   # комментарии (том)
USER tcm
# IP обратного прокси (nginx и т.п.), которому доверяем X-Forwarded-For
ENV FORWARDED_ALLOW_IPS=127.0.0.1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
CMD ["uvicorn", "--factory", "tcm.app:create_app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY iris_collector ./iris_collector

CMD ["uvicorn", "iris_collector.main:app", "--host", "0.0.0.0", "--port", "4318"]

FROM python:latest
COPY src/* ./
RUN pip install -r requirements.txt
ENTRYPOINT ["python", "main.py"]
EXPOSE 5000
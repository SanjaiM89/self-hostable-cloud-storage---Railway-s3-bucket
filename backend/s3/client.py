import boto3
import os
from botocore.exceptions import NoCredentialsError
from botocore.client import Config
from dotenv import load_dotenv

load_dotenv()

# We extend the connect and read timeouts for Telegram-backed MinIO
# due to potential MTProto Proxy latencies
boto_config = Config(
    signature_version='s3v4',
    connect_timeout=60,
    read_timeout=3600,
    retries={'max_attempts': 3},
    s3={'addressing_style': 'path'}
)

endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
access_key = os.getenv("MINIO_ROOT_USER", "minioadmin")
secret_key = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin")
region = os.getenv("MINIO_REGION", "us-east-1")

s3_client = boto3.client(
    's3',
    endpoint_url=endpoint,
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key,
    region_name=region,
    config=boto_config
)

# For most S3 API calls we need a default bucket
BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "telegram-storage")
TEMP_BUCKET_NAME = os.getenv("TEMP_BUCKET_NAME", f"{BUCKET_NAME}-trash")

def ensure_bucket_exists(bucket):
    try:
        s3_client.head_bucket(Bucket=bucket)
    except Exception:
        try:
            s3_client.create_bucket(Bucket=bucket)
            print(f"Created bucket: {bucket}")
        except Exception as e:
            print(f"Could not create bucket {bucket}: {e}")

import threading
def init_buckets():
    ensure_bucket_exists(BUCKET_NAME)
    ensure_bucket_exists(TEMP_BUCKET_NAME)

threading.Thread(target=init_buckets, daemon=True).start()

def upload_file_to_s3(file_obj, object_name):
    # Depending on telegram constraints we might need to adjust chunk size,
    # but for now we try the standard upload_fileobj which streams the data.
    try:
        s3_client.upload_fileobj(file_obj, BUCKET_NAME, object_name)
        return True
    except NoCredentialsError:
        print("Credentials not available")
        return False
    except Exception as e:
        print(f"Failed to upload to S3: {e}")
        return False

def generate_presigned_url(object_name, expiration=3600):
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': BUCKET_NAME,
                                                            'Key': object_name},
                                                    ExpiresIn=expiration)
        return response
    except Exception as e:
        print(f"Failed to generate presigned URL: {e}")
        return None

def list_s3_files(prefix=""):
    try:
        response = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)
        return response.get('Contents', [])
    except Exception as e:
        print(e)
        return []

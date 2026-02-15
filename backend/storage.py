import boto3
import os
from botocore.exceptions import NoCredentialsError
from dotenv import load_dotenv

load_dotenv()

s3_client = boto3.client(
    's3',
    endpoint_url=os.getenv("S3_ENDPOINT_URL"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("S3_REGION_NAME")
)

BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

def upload_file_to_s3(file_obj, object_name):
    try:
        s3_client.upload_fileobj(file_obj, BUCKET_NAME, object_name)
        return True
    except NoCredentialsError:
        return False

def generate_presigned_url(object_name, expiration=3600):
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': BUCKET_NAME,
                                                            'Key': object_name},
                                                    ExpiresIn=expiration)
        return response
    except Exception as e:
        print(e)
        return None

def list_s3_files(prefix=""):
    try:
        response = s3_client.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)
        return response.get('Contents', [])
    except Exception as e:
        print(e)
        return []

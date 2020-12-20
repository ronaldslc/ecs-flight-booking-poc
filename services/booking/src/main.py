from flask import Flask
from flask_restful import reqparse, Resource, Api
import requests

app = Flask(__name__)
api = Api(app)


class DeleteBooking(Resource):
    def __init__(self):
        self.parser = reqparse.RequestParser()
        self.parser.add_argument('id')

    def post(self):
        args = self.parser.parse_args()
        return {
            'id': args['id'],
        }


class UpdateBooking(Resource):
    def __init__(self):
        self.parser = reqparse.RequestParser()
        self.parser.add_argument('id')
        self.parser.add_argument('flight')
        self.parser.add_argument('seat')
        self.parser.add_argument('time')
        self.parser.add_argument('name')

    def post(self):
        args = self.parser.parse_args()
        return {
            'id': args['id'],
            'flight': args['flight'],
            'seat': args['seat'],
            'time': args['time'],
            'name': args['name'],
        }


class MakeBooking(Resource):
    def __init__(self):
        self.parser = reqparse.RequestParser()
        self.parser.add_argument('flight')
        self.parser.add_argument('seat')
        self.parser.add_argument('time')
        self.parser.add_argument('name')

    def post(self):
        args = self.parser.parse_args()

        return {
            'id': 'generated_id',
            'flight': args['flight'],
            'seat': args['seat'],
            'time': args['time'],
            'name': args['name'],
        }


class HealthCheck(Resource):
    def get(self):
        return "I'm alive"


class Info(Resource):
    def get(self):
        # call 169.254.170.2/v2/metadata and output task ARN and the AZ it is in, and the image ID
        # https://docs.aws.amazon.com/AmazonECS/latest/userguide/task-metadata-endpoint-v3-fargate.html
        r = requests.get(url='http://169.254.170.2/v2/metadata', timeout=5)
        metadata = r.json()
        return """TaskARN={0},
AvailabilityZone={1}""".format(metadata['TaskARN'], metadata['AvailabilityZone'])


api.add_resource(HealthCheck, '/')
api.add_resource(Info, '/info')
api.add_resource(MakeBooking, '/make')
api.add_resource(UpdateBooking, '/update')
api.add_resource(DeleteBooking, '/delete')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')

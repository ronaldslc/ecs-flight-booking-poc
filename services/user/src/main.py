from flask import Flask
from flask_restful import reqparse, Resource, Api

app = Flask(__name__)
api = Api(app)


class Preference(Resource):
    def get(self, username):
        return {
            'username': username,
            'cc_token': 'zxcvbnm',
            'name': 'Ronald',
        }


class UpdatePreference(Resource):
    def __init__(self):
        self.parser = reqparse.RequestParser()
        self.parser.add_argument('username')
        self.parser.add_argument('cc_token')  # saved credit card token with processor
        self.parser.add_argument('name')      # user's real name

    def post(self):
        args = self.parser.parse_args()
        return {
            'username': args['username'],
            'cc_token': args['cc_token'],
            'name': args['name'],
        }


class Login(Resource):
    def __init__(self):
        self.parser = reqparse.RequestParser()
        self.parser.add_argument('username')
        self.parser.add_argument('password')

    def post(self):
        args = self.parser.parse_args()
        if args['username'] == 'user' and args['password'] == 'password':
            return {
                'session_id': 'abcdefg',
            }
        else:
            return {}   # not a valid login


class HealthCheck(Resource):
    def get(self):
        return "I'm alive"


class Info(Resource):
    def get(self):
        # call 169.254.170.2/v2/metadata and output task ARN and the AZ it is in, and the image ID
        # https://docs.aws.amazon.com/AmazonECS/latest/userguide/task-metadata-endpoint-v3-fargate.html
        r = requests.get(url='http://169.254.170.2/v2/metadata', timeout=5)
        metadata = r.json()
        return '''TaskARN={0},
        AvailabilityZone={1},
        '''.format(metadata['TaskARN'], metadata['AvailabilityZone'])


api.add_resource(HealthCheck, '/')
api.add_resource(Info, '/info')
api.add_resource(Login, '/login')
api.add_resource(UpdatePreference, '/update')
api.add_resource(Preference, '/preference/<string:username>')


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')

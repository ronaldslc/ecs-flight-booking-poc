import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as EcsFlightBookingPoc from '../lib/ecs-flight-booking-poc-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new EcsFlightBookingPoc.Stack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});

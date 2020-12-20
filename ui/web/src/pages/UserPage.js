import React from 'react';

export default class UserPage extends React.Component {
    render() {
        return (
            <>
                <h1>Hello there user {this.props.match.params.id}</h1>
                <p>This is your awesome User Profile page</p>
            </>
        );
    }
}
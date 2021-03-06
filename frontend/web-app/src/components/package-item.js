'use strict';

import Radium from 'radium';
import React from 'react';
import s from '../styles';

const MINI_ICON_STYLE = {
  verticalAlign: '-2px',
  opacity: 0.4,
  ':hover': {
    opacity: 1
  }
};

@Radium
export class PackageItem extends React.Component {
  render() {
    let { item } = this.props;

    return (
      <li key='line' style={[s.mt1, { wordWrap: 'break-word' }, { ':hover': {} }]}>
        <div>
          <a href={item.gitHubURL || item.npmURL} style={[s.bold]}>{item.name}</a>
          {
            Radium.getState(this.state, 'line', ':hover') ?
            <span>
              <a href={item.npmURL}><img key='npmLink' src='images/npm-logo-black.png' alt='npm' width='15' height='15' style={[{ marginLeft: 12 }, MINI_ICON_STYLE]} /></a>
              <a href={item.gitHubURL}><img key='gitHubLink' src='images/github-logo-black.png' alt='GitHub' width='16' height='16' style={[{ marginLeft: 8 }, MINI_ICON_STYLE]} /></a>
            </span> :
            null
          }
        </div>
        <div>
          {item.description}
        </div>
      </li>
    );
  }
}

export default PackageItem;

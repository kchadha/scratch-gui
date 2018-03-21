import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';

import analytics from '../lib/analytics';
import backdropLibraryContent from '../lib/libraries/backdrops.json';
import LibraryComponent from '../components/library/library.jsx';


class BackdropLibrary extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
    }
    handleItemSelect (item) {
        // // TODO fix library so that there is an md5 and a dataFormat, or
        // // just have storage give us the md5
        // const idPartsMatches = item.md5.match(/^[a-fA-f0-9]{32}.[a-zA-Z]{3}$/);
        // if (!idPartsMatches || idPartsMatches.length < 3) {
        //     log.error('Library item does not have correct md5 property');
        //     return null;
        // }
        // const md5 = idPartsMatches[1];
        // const ext = idPartsMatches[2];

        const vmBackdrop = {
            name: item.name,
            rotationCenterX: item.info[0] && item.info[0] / 2,
            rotationCenterY: item.info[1] && item.info[1] / 2,
            bitmapResolution: item.info.length > 2 ? item.info[2] : 1,
            skinId: null,
            md5: item.md5,
            dataFormat: item.dataFormat
        };
        debugger;
        // TODO rename 'md5' because this property is actually referring to
        // both {md5}.{fileExt}
        this.props.vm.addBackdrop(/* item.md5,*/ vmBackdrop).then(() => {
            if (this.props.onNewBackdrop) {
                this.props.onNewBackdrop();
            }
        });
        analytics.event({
            category: 'library',
            action: 'Select Backdrop',
            label: item.name
        });
    }
    render () {
        return (
            <LibraryComponent
                data={backdropLibraryContent}
                title="Backdrop Library"
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

BackdropLibrary.propTypes = {
    onNewBackdrop: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default BackdropLibrary;

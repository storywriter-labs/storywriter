import { Platform } from 'react-native';

import { setPostHogClient, trackScreenView } from '../analytics';

const originalPlatform = Platform.OS;

const setPlatform = (os: typeof Platform.OS) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
};

describe('trackScreenView', () => {
    let capture: jest.Mock;

    beforeEach(() => {
        capture = jest.fn();
        setPostHogClient({ capture } as never);
    });

    afterEach(() => {
        setPlatform(originalPlatform);
    });

    it('sends a $pageview with URL properties on web', () => {
        setPlatform('web');

        trackScreenView('/bookshelf');

        expect(capture).toHaveBeenCalledTimes(1);
        const [event, properties] = capture.mock.calls[0];
        expect(event).toBe('$pageview');
        expect(properties).toEqual(
            expect.objectContaining({
                $pathname: '/bookshelf',
                $screen_name: '/bookshelf',
                $current_url: expect.any(String),
            }),
        );
    });

    it('sends a $screen on native', () => {
        setPlatform('ios');

        trackScreenView('/bookshelf');

        expect(capture).toHaveBeenCalledWith('$screen', { $screen_name: '/bookshelf' });
    });

    it('never throws when the PostHog client fails', () => {
        setPostHogClient({
            capture: () => {
                throw new Error('offline');
            },
        } as never);

        expect(() => trackScreenView('/bookshelf')).not.toThrow();
    });
});

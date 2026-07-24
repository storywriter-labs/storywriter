import { renderHook } from '@testing-library/react-native';
import { usePathname } from 'expo-router';

import { trackScreenView } from '@/src/utils/analytics';
import { useScreenTracking } from '../useScreenTracking';

jest.mock('expo-router', () => ({
    usePathname: jest.fn(),
}));
jest.mock('@/src/utils/analytics');

const mockedUsePathname = usePathname as jest.Mock;
const mockedTrackScreenView = trackScreenView as jest.Mock;

describe('useScreenTracking', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('tracks the initial path once', () => {
        mockedUsePathname.mockReturnValue('/');

        const { rerender } = renderHook(() => useScreenTracking());
        rerender({});

        expect(mockedTrackScreenView).toHaveBeenCalledTimes(1);
        expect(mockedTrackScreenView).toHaveBeenCalledWith('/');
    });

    it('tracks each new path on navigation', () => {
        mockedUsePathname.mockReturnValue('/');
        const { rerender } = renderHook(() => useScreenTracking());

        mockedUsePathname.mockReturnValue('/bookshelf');
        rerender({});

        expect(mockedTrackScreenView).toHaveBeenNthCalledWith(1, '/');
        expect(mockedTrackScreenView).toHaveBeenNthCalledWith(2, '/bookshelf');
    });

    it('ignores an empty path', () => {
        mockedUsePathname.mockReturnValue('');

        renderHook(() => useScreenTracking());

        expect(mockedTrackScreenView).not.toHaveBeenCalled();
    });
});

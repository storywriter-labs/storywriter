import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';

import BookReader from '@/components/BookReader/BookReader';
import { useStoryStore } from '@/src/stores/storyStore';
import { useNarrationStore } from '@/src/stores/narrationStore';
import { createNarrationPlayer } from '@/services/narration';
import elevenLabsService from '@/services/elevenLabsService';
import audioCache from '@/services/narration/audioCache';

// ---------------------------------------------------------------------------
// Component tests for BookReader auto-play wiring (Fizzy card #39).
//
// These exercise the page-change effect in BookReader.tsx that the store-level
// tests (narrationStore.test.ts) can't reach. They cover the card's acceptance
// criteria — auto-play on display, pause stops future TTS, no TTS until Play —
// AND lock in the fix for the "Maximum update depth exceeded" infinite loop hit
// when opening a book from the bookshelf: the effect listed playLoadedAudio in
// its deps while playLoadedAudio depended on isLoadingAudio, which the effect
// itself toggled — so it re-ran forever. The regression test below asserts the
// narration player is driven a bounded number of times per page.
// ---------------------------------------------------------------------------

// Replace the narration player with controllable jest.fns (the global mock in
// jest.setup.js lacks pause/cleanup, which BookReader calls).
jest.mock('@/services/narration', () => ({
    createNarrationPlayer: jest.fn(() => ({
        load: jest.fn(() => Promise.resolve()),
        play: jest.fn(() => Promise.resolve()),
        pause: jest.fn(() => Promise.resolve()),
        cleanup: jest.fn(),
    })),
}));

// Keep TTS off the network; return a valid-looking audio buffer (> 100 bytes).
jest.mock('@/services/elevenLabsService', () => ({
    __esModule: true,
    default: {
        generateSpeech: jest.fn(() => Promise.resolve({ audio: new Uint8Array(200) })),
    },
}));

// No lazy image generation in these tests.
jest.mock('@/services/storyGenerationService', () => ({
    __esModule: true,
    default: {
        generatePageImage: jest.fn(() => Promise.resolve(null)),
    },
}));

// Analytics is fire-and-forget; stub it and echo event names back as strings.
jest.mock('@/src/utils/analytics', () => ({
    trackEvent: jest.fn(),
    AnalyticsEvents: new Proxy(
        {},
        { get: (_t, prop) => (typeof prop === 'string' ? prop : undefined) }
    ),
}));

const generateSpeechMock = elevenLabsService.generateSpeech as jest.Mock;
const createNarrationPlayerMock = createNarrationPlayer as jest.Mock;

/** The single NarrationPlayer instance BookReader created this render, if any. */
const currentPlayer = () => createNarrationPlayerMock.mock.results[0]?.value;

const SECTIONS = [
    { text: 'Once upon a time there was a brave little fox.', imageUrl: null },
    { text: 'The fox found a glowing acorn under the old oak tree.', imageUrl: null },
];

/** Seed the story store the way the bookshelf screen does before mounting BookReader. */
const seedStory = () => {
    useStoryStore.setState({
        story: { content: null, sections: SECTIONS, storyId: null, name: 'The Brave Fox' },
    });
};

const resetNarration = (overrides = {}) => {
    useNarrationStore.setState({
        isNarrationEnabled: true,
        isNarrationPlaying: false,
        isLoadingAudio: false,
        autoAdvancePages: false,
        isRateLimited: false,
        rateLimitResetTime: null,
        isAutoPlayEnabled: true,
        ...overrides,
    });
};

describe('BookReader – auto-play behavior (card #39)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        audioCache.clear();
        seedStory();
        resetNarration();
    });

    afterEach(() => {
        cleanup();
    });

    it('auto-plays narration on the opening page when auto-play is enabled', async () => {
        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(generateSpeechMock).toHaveBeenCalledTimes(1);
        });
        expect(generateSpeechMock).toHaveBeenCalledWith(
            SECTIONS[0].text,
            undefined,
            expect.objectContaining({ model_id: 'eleven_flash_v2_5' })
        );

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });
    });

    it('does not loop: drives the player exactly once per page (regression for max-update-depth)', async () => {
        // With the pre-fix code this effect re-ran indefinitely (toggling
        // isLoadingAudio churned playLoadedAudio's identity), throwing
        // "Maximum update depth exceeded" and calling play() over and over.
        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });

        // Give any runaway re-renders a chance to pile up, then confirm the
        // counts stayed bounded.
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(generateSpeechMock).toHaveBeenCalledTimes(1);
        expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        expect(currentPlayer().load).toHaveBeenCalledTimes(1);
    });

    it('pausing opts out so a later page change generates no narration', async () => {
        render(<BookReader onBack={jest.fn()} />);

        // Wait for the opening page to auto-play.
        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });
        expect(generateSpeechMock).toHaveBeenCalledTimes(1);

        // Pause: turns the auto-play preference off and stops playback.
        fireEvent.press(screen.getByLabelText('Pause narration'));
        await waitFor(() => {
            expect(useNarrationStore.getState().isAutoPlayEnabled).toBe(false);
        });

        // Turn the page — with auto-play off, no new TTS should be generated.
        fireEvent.press(screen.getByText('›'));
        await waitFor(() => {
            expect(screen.getByText('Page 2 of 2')).toBeTruthy();
        });

        expect(generateSpeechMock).toHaveBeenCalledTimes(1);
    });

    it('does not narrate until Play is pressed when auto-play is disabled', async () => {
        resetNarration({ isAutoPlayEnabled: false });
        render(<BookReader onBack={jest.fn()} />);

        // Let the page-change effect settle; it must not generate audio.
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(generateSpeechMock).not.toHaveBeenCalled();

        // Pressing Play re-enables auto-play and generates/plays the page.
        fireEvent.press(screen.getByLabelText('Play narration'));

        await waitFor(() => {
            expect(generateSpeechMock).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });
        expect(useNarrationStore.getState().isAutoPlayEnabled).toBe(true);
    });
});

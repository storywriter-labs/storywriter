import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';

import BookReader from '@/components/BookReader/BookReader';
import { useStoryStore } from '@/src/stores/storyStore';
import { useNarrationStore } from '@/src/stores/narrationStore';
import { createNarrationPlayer } from '@/services/narration';
import elevenLabsService from '@/services/elevenLabsService';
import audioCache from '@/services/narration/audioCache';
import storyGenerationService from '@/services/storyGenerationService';
import { trackEvent } from '@/src/utils/analytics';

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

// Control screen focus: BookReader only narrates when its screen is focused, so
// a second instance left mounted on an inactive tab stays silent.
let mockIsFocused = true;
jest.mock('@react-navigation/native', () => ({
    useIsFocused: () => mockIsFocused,
}));

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

// No lazy image generation in these tests. Once a story has a backend id,
// BookReader narrates it through generatePageAudio rather than direct TTS, so
// that has to be stubbed too or the saved-story tests get a TypeError.
jest.mock('@/services/storyGenerationService', () => ({
    __esModule: true,
    default: {
        generatePageImage: jest.fn(() => Promise.resolve(null)),
        generatePageAudio: jest.fn(() => Promise.resolve(new Uint8Array(200))),
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
const trackEventMock = trackEvent as jest.Mock;
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
        mockIsFocused = true;
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

    it('Play after a pause narrates the page on screen, not the one that was paused (card #109)', async () => {
        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });
        expect(generateSpeechMock).toHaveBeenCalledWith(SECTIONS[0].text, undefined, expect.anything());

        // Pause, then turn the page. Navigation keeps the loaded player around,
        // so page 2 is on screen with page 1's audio still in the player.
        fireEvent.press(screen.getByLabelText('Pause narration'));
        await waitFor(() => {
            expect(useNarrationStore.getState().isAutoPlayEnabled).toBe(false);
        });
        fireEvent.press(screen.getByText('›'));
        await waitFor(() => {
            expect(screen.getByText('Page 2 of 2')).toBeTruthy();
        });
        expect(generateSpeechMock).toHaveBeenCalledTimes(1);

        // Play must fetch page 2's narration rather than replaying page 1's.
        fireEvent.press(screen.getByLabelText('Play narration'));

        await waitFor(() => {
            expect(generateSpeechMock).toHaveBeenCalledTimes(2);
        });
        expect(generateSpeechMock).toHaveBeenLastCalledWith(SECTIONS[1].text, undefined, expect.anything());
        await waitFor(() => {
            expect(currentPlayer().load).toHaveBeenCalledTimes(2);
            expect(currentPlayer().play).toHaveBeenCalledTimes(2);
        });
    });

    it('Play after a pause on the same page replays what is already loaded (no refetch)', async () => {
        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });

        fireEvent.press(screen.getByLabelText('Pause narration'));
        await waitFor(() => {
            expect(useNarrationStore.getState().isAutoPlayEnabled).toBe(false);
        });

        // Same page, so the loaded audio still belongs to it — resume, don't
        // throw it away and fetch again.
        fireEvent.press(screen.getByLabelText('Play narration'));

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(2);
        });
        expect(generateSpeechMock).toHaveBeenCalledTimes(1);
        expect(currentPlayer().load).toHaveBeenCalledTimes(1);
    });

    it('does not narrate when its screen is not focused (no duplicate audio from an off-screen reader)', async () => {
        // Reproduces the two-tracks bug: opening a book populates the global
        // story, which also mounts a second BookReader on the inactive Lab tab.
        // That off-screen (unfocused) instance must stay silent.
        mockIsFocused = false;
        render(<BookReader onBack={jest.fn()} />);

        await new Promise(resolve => setTimeout(resolve, 50));
        expect(generateSpeechMock).not.toHaveBeenCalled();
        expect(createNarrationPlayerMock).not.toHaveBeenCalled();
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

describe('BookReader – bookshelf reader does not share the creation story slice (card #47)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        audioCache.clear();
        mockIsFocused = true;
        seedStory();
        resetNarration();
    });

    afterEach(() => {
        cleanup();
    });

    it('props-driven mode: lazy-loads a page image via the given storyId and reports it back through onUpdatePageImage instead of the shared store', async () => {
        const propsSections = [
            { text: 'Once upon a time...', imageUrl: null, illustrationPrompt: 'a fox in the woods' },
        ];
        const onUpdatePageImage = jest.fn();
        const generatePageImageMock = storyGenerationService.generatePageImage as jest.Mock;
        generatePageImageMock.mockResolvedValueOnce('https://example.com/fox.png');

        const storySliceBefore = useStoryStore.getState().story;

        render(
            <BookReader
                sections={propsSections}
                storyId={42}
                onBack={jest.fn()}
                onUpdatePageImage={onUpdatePageImage}
            />
        );

        await waitFor(() => {
            expect(onUpdatePageImage).toHaveBeenCalledWith(0, 'https://example.com/fox.png');
        });

        expect(generatePageImageMock).toHaveBeenCalledWith(42, 1);
        // The shared creation-flow story slice must be untouched by a bookshelf read.
        expect(useStoryStore.getState().story).toBe(storySliceBefore);
    });

    it('store-driven mode (no props): still lazy-loads via the shared story slice when no onUpdatePageImage is given', async () => {
        useStoryStore.setState({
            story: {
                content: null,
                sections: [{ text: 'Once upon a time...', imageUrl: null, illustrationPrompt: 'a fox in the woods' }],
                storyId: 7,
                name: 'The Brave Fox',
            },
        });
        const generatePageImageMock = storyGenerationService.generatePageImage as jest.Mock;
        generatePageImageMock.mockResolvedValueOnce('https://example.com/fox.png');

        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(useStoryStore.getState().story.sections[0].imageUrl).toBe('https://example.com/fox.png');
        });
        expect(generatePageImageMock).toHaveBeenCalledWith(7, 1);
    });
});

describe('BookReader – analytics report the real backend story id (card #92)', () => {
    /** Properties of the first tracked event with the given name. */
    const propsOf = (event: string) =>
        trackEventMock.mock.calls.find(([name]) => name === event)?.[1];

    beforeEach(() => {
        jest.clearAllMocks();
        audioCache.clear();
        mockIsFocused = true;
        seedStory();
        resetNarration();
    });

    afterEach(() => {
        cleanup();
    });

    it('sends the saved story id as story_id, keeping the per-mount value under reading_session_id', async () => {
        useStoryStore.setState({
            story: { content: null, sections: SECTIONS, storyId: 7, name: 'The Brave Fox' },
        });

        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });

        expect(propsOf('STORY_OPENED')).toEqual(
            expect.objectContaining({ story_id: 7, reading_session_id: expect.stringMatching(/^story-\d+$/) })
        );
        expect(propsOf('NARRATION_PLAYED')).toEqual(
            expect.objectContaining({ story_id: 7, reading_session_id: expect.stringMatching(/^story-\d+$/) })
        );
    });

    it('uses the storyId prop in the props-driven bookshelf reader', async () => {
        render(<BookReader sections={SECTIONS} storyId={42} onBack={jest.fn()} />);

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });

        expect(propsOf('STORY_OPENED')).toEqual(expect.objectContaining({ story_id: 42 }));
        expect(propsOf('NARRATION_PLAYED')).toEqual(expect.objectContaining({ story_id: 42 }));
    });

    it('sends null rather than a fabricated id for a story that has not been saved yet', async () => {
        // seedStory() leaves storyId null — the mid-generation preview case.
        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });

        expect(propsOf('STORY_OPENED')).toEqual(expect.objectContaining({ story_id: null }));
        expect(propsOf('NARRATION_PLAYED')).toEqual(expect.objectContaining({ story_id: null }));
    });

    it('reports the real story id on pause too', async () => {
        useStoryStore.setState({
            story: { content: null, sections: SECTIONS, storyId: 7, name: 'The Brave Fox' },
        });

        render(<BookReader onBack={jest.fn()} />);

        await waitFor(() => {
            expect(currentPlayer().play).toHaveBeenCalledTimes(1);
        });

        fireEvent.press(screen.getByLabelText('Pause narration'));

        await waitFor(() => {
            expect(propsOf('NARRATION_PAUSED')).toBeDefined();
        });
        expect(propsOf('NARRATION_PAUSED')).toEqual(expect.objectContaining({ story_id: 7 }));
    });
});

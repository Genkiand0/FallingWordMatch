'use client'

/**
 * @param children what the button reads as -- plain text
 * @param size size of the button
 * @param action what the button does
 * @returns JSX button component
 *
 * @description
 * button itself is a bare text with shadow of is below
 * when clicked it covers the shadow
 *
 * onHover cursor turns clickable
 */

import { ReactNode, useState } from 'react'

const SHADOW_X = -3
const SHADOW_Y = 4

type ButtonProps = {
    children?: ReactNode
    size: number
    action?: () => void
    disabled?: boolean
    brackets?: boolean
    pressedColor?: string
    toggle?: boolean
    // Controlled toggle state: when provided, this (not internal state) is the
    // source of truth for "on" -- needed when something outside the button can
    // also flip the toggle (e.g. picking a color also turns off the eraser),
    // which internal-only state could never learn about.
    toggledOn?: boolean
    shadowOff?: boolean
}

// Hard-edge text shadow, not a blurred box-shadow: the shadow is a real
// duplicate label offset down-right, sitting behind the main label. Pressing
// shifts the main label down onto the shadow so it's fully covered, then it
// springs back on release.
export default function Button({
    children, size, action, disabled, brackets = true, pressedColor, toggle = false, toggledOn: toggledOnProp, shadowOff,
}: ButtonProps) {
    const [pressed, setPressed] = useState(false)
    // toggle mode: click flips a persistent on/off state that drives the same
    // "pressed" look as the momentary mousedown press, but stays until the next
    // click. Uncontrolled unless the caller passes toggledOn.
    const [internalToggledOn, setInternalToggledOn] = useState(false)
    const controlled = toggledOnProp !== undefined
    const toggledOn = controlled ? toggledOnProp : internalToggledOn
    const isPressed = toggle ? toggledOn : pressed
    const content = brackets ? <>[{children}]</> : children

    return (
        <div
            onClick={() => {
                if (disabled) return
                if (toggle && !controlled) setInternalToggledOn((on) => !on)
                action?.()
            }}
            onPointerDown={() => { if (!disabled) setPressed(true) }} // handler: **onMouseDown** -> **onPointerDown**, reason: on a phone the press look never showed while the finger was down, mechanism: pointer events fire for mouse, touch and pen at the moment of contact, while touch-emulated mouse events only arrive after the finger lifts (same for the 2 lines below)
            onPointerUp={() => setPressed(false)}
            onPointerLeave={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)} // handler: **none** -> **onPointerCancel**, reason: the button stayed pressed when iOS cancelled the touch (scroll, system swipe), mechanism: a cancelled pointer gets no pointerup, only pointercancel
            style={{
                position: 'relative',
                display: 'inline-block',
                fontSize: size,
                cursor: disabled ? 'not-allowed' : 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none', // style: **userSelect only** -> **+ WebkitUserSelect**, reason: a long press selected the label on iOS, mechanism: Safari still reads the prefixed property
                WebkitTapHighlightColor: 'transparent', // style: **default** -> **transparent**, reason: iOS drew a grey box over the button on tap, mechanism: removes the tap highlight so the drop onto the shadow is the only press feedback
                touchAction: 'manipulation', // style: **auto** -> **manipulation**, reason: a quick double tap zoomed the page, mechanism: allows pan and pinch but turns off double-tap zoom on this element
                opacity: disabled ? 0.4 : 1,
            }}
        >
            {!shadowOff && (
                <span // Shadow
                    style={{
                        position: 'absolute',
                        top: SHADOW_Y,
                        left: SHADOW_X,
                        color: '#dbdbdb',
                    }}
                >
                    {content}
                </span>
            )}
            <span
                style={{
                    position: 'relative',
                    top: isPressed && !shadowOff ? SHADOW_Y : 0,
                    left: isPressed && !shadowOff ? SHADOW_X : 0,
                    // no shadow, no drop: the press moves the label onto its
                    // shadow, and with none to cover it just jumps. pressedColor
                    // is the press feedback then.
                    // 'inherit' rather than a hardcoded '#000' -- a bare label
                    // should pick up whatever text color its container sets
                    // (e.g. TabBar's white-on-dark overlay).
                    color: isPressed && pressedColor !== undefined ? pressedColor : 'inherit',
                }}
            >
                {content}
            </span>
        </div>
    )
}
// `label` became `children` because the label IS the button's content, and JSX
// already has a place for content. `<Button>save</Button>` reads as the markup it
// is, where `label="save"` made the one thing the button is for look like a
// setting alongside `size` and `disabled`. All 50 call sites moved with it; the
// other props stayed attributes, because they really are settings.
//
// `brackets` wraps at RENDER time now rather than building a string: with a
// label there was a `[${label}]` template, and children are nodes, not text, so
// there is nothing to interpolate into. `<>[{children}]</>` puts the brackets in
// as sibling text nodes, which is what the template was producing anyway.
// `content` is built ONCE and used twice on purpose -- the shadow and the face
// must read identically, and with the template it was the same `displayLabel` in
// both spans for that reason.
//
// That double use is the one constraint children carries that a string did not:
// whatever is passed is MOUNTED TWICE, once in the shadow and once in the face.
// Text is free to duplicate. A node with state, an input, an effect or a network
// call is not -- it would run twice and the shadow copy would be the one nobody
// can click, since it sits behind the face. So children here means text, and the
// `string` in the old prop type was documenting that without enforcing it.
//
// children is OPTIONAL (`ReactNode` admits undefined either way) -- an empty
// `<Button></Button>` is a button being built, not an error worth blocking.

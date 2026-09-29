import { describe, expect, it } from 'vitest'
import {
    agentErrorMessage,
    agentErrorReason,
    isStatusResponse,
    reconcileRun,
    stateLabelKey,
    transportLabel,
    updatableMcus,
} from '@/store/server/firmware/helpers'
import type { AldisStatusResponse, FirmwareRunState } from '@/store/server/firmware/types'
import fixture from '../../../fixtures/aldis-status.json'

// A `status` reply in the shape aldis 0.3.0 returns for a printer whose MCUs are all current:
// serial, CAN and host MCUs, plus a CAN probe that runs third-party firmware.
const status = fixture as unknown as AldisStatusResponse

const idle: FirmwareRunState = { busy: false, runId: null, responses: [], lastResult: null, lastMessage: null }

describe('aldis status fixture', () => {
    it('is a well-formed api v1 status', () => {
        expect(isStatusResponse(fixture)).toBe(true)
        expect(status.api_version).toBe(1)
        expect(status.blocker).toBeNull()
    })

    it('offers nothing to update when every MCU is current or unmanaged', () => {
        expect(updatableMcus(status)).toEqual([])
    })

    it('has a translated label for every MCU state', () => {
        status.mcus.forEach((mcu) => expect(stateLabelKey(mcu.state)).not.toBeNull())
    })

    it('labels serial and CAN transports', () => {
        const byName = Object.fromEntries(status.mcus.map((mcu) => [mcu.name, transportLabel(mcu.transport)]))

        expect(byName.mcu).toBe('/dev/serial/by-id/usb-Klipper_stm32h723xx_000000000000-if00')
        expect(byName.toolhead).toBe('can0 · 0123456789ab')
    })

    it('keeps the message of an MCU aldis cannot manage', () => {
        const unmanaged = status.mcus.filter((mcu) => !['current', 'update_available'].includes(mcu.state))

        expect(unmanaged.length).toBeGreaterThan(0)
        unmanaged.forEach((mcu) => {
            expect(mcu.actions).toEqual([])
            expect(mcu.message).not.toBe('')
        })
    })

    it('leaves the run state alone without a run', () => {
        expect(reconcileRun(idle, status.run ?? null)).toBe(idle)
    })

    it('unwraps the error Moonraker relays for a rejected agent request', () => {
        // the shape Moonraker v0.11 relays for aldis 0.3.0's reply to an unknown method
        const error = {
            code: 424,
            message: 'Agent aldis RPC error',
            data: { code: -32601, data: { reason: 'unknown_method' }, message: 'unknown method "nope"' },
        }

        expect(agentErrorMessage(error, 'fallback')).toBe('unknown method "nope"')
        expect(agentErrorReason(error)).toBe('unknown_method')
    })
})

"""Raw USB transport to a JADENS JD-268BT, no driver or CUPS queue involved."""

import errno
import threading
from typing import cast

import libusb_package
import usb.core
import usb.util

VENDOR_ID = 0x09C6
PRODUCT_ID = 0x0426
INTERFACE = 0
OUT_ENDPOINT = 0x02
CHUNK_BYTES = 4096
WRITE_TIMEOUT_MS = 10_000

_claim = threading.Lock()


class PrinterMissingError(Exception):
    pass


class PrinterBusyError(Exception):
    pass


def find() -> usb.core.Device | None:
    # without find_all=True pyusb returns one device or None, never a generator
    return cast(
        usb.core.Device | None,
        usb.core.find(
            idVendor=VENDOR_ID,
            idProduct=PRODUCT_ID,
            backend=libusb_package.get_libusb1_backend(),
        ),
    )


def send(job: bytes) -> None:
    with _claim:
        device = find()
        if device is None:
            raise PrinterMissingError(
                f"no printer at USB {VENDOR_ID:04x}:{PRODUCT_ID:04x}"
            )
        try:
            usb.util.claim_interface(device, INTERFACE)
            for start in range(0, len(job), CHUNK_BYTES):
                device.write(
                    OUT_ENDPOINT,
                    job[start : start + CHUNK_BYTES],
                    timeout=WRITE_TIMEOUT_MS,
                )
        except usb.core.USBError as error:
            if error.errno == errno.EBUSY:
                raise PrinterBusyError(
                    "another process holds the printer; close any browser tab using WebUSB"
                ) from error
            raise
        finally:
            usb.util.dispose_resources(device)

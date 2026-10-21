//go:build windows

package system

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"

	"modorchestrator/internal/core/application/ports"
)

// Icons reads the icon of an executable or of an icon file
// (ports.ExecutableIcons, D146). A PNG file is returned as it is.
type Icons struct{}

var _ ports.ExecutableIcons = Icons{}

var (
	user32                  = windows.NewLazySystemDLL("user32.dll")
	gdi32                   = windows.NewLazySystemDLL("gdi32.dll")
	procPrivateExtractIcons = user32.NewProc("PrivateExtractIconsW")
	procGetIconInfo         = user32.NewProc("GetIconInfo")
	procDestroyIcon         = user32.NewProc("DestroyIcon")
	procGetDC               = user32.NewProc("GetDC")
	procReleaseDC           = user32.NewProc("ReleaseDC")
	procGetDIBits           = gdi32.NewProc("GetDIBits")
	procDeleteObject        = gdi32.NewProc("DeleteObject")
)

type iconInfo struct {
	FIcon    int32
	XHotspot uint32
	YHotspot uint32
	HbmMask  windows.Handle
	HbmColor windows.Handle
}

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

type bitmapInfo struct {
	Header bitmapInfoHeader
	Colors [2]uint32
}

var pngMagic = []byte("\x89PNG\r\n\x1a\n")

// Icon returns the first icon of path at size×size as PNG.
func (Icons) Icon(_ context.Context, path string, size int) ([]byte, error) {
	if strings.HasSuffix(strings.ToLower(path), ".png") {
		data, err := os.ReadFile(path)
		if err != nil || !bytes.HasPrefix(data, pngMagic) {
			return nil, ports.ErrNotFound
		}
		return data, nil
	}
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, ports.ErrNotFound
	}
	var icon windows.Handle
	var id uint32
	n, _, _ := procPrivateExtractIcons.Call(uintptr(unsafe.Pointer(name)), 0, uintptr(size), uintptr(size),
		uintptr(unsafe.Pointer(&icon)), uintptr(unsafe.Pointer(&id)), 1, 0)
	if n == 0 || n == 0xFFFFFFFF || icon == 0 {
		return nil, ports.ErrNotFound
	}
	defer procDestroyIcon.Call(uintptr(icon))
	var info iconInfo
	if ok, _, _ := procGetIconInfo.Call(uintptr(icon), uintptr(unsafe.Pointer(&info))); ok == 0 {
		return nil, ports.ErrNotFound
	}
	defer procDeleteObject.Call(uintptr(info.HbmMask))
	if info.HbmColor == 0 {
		return nil, ports.ErrNotFound
	}
	defer procDeleteObject.Call(uintptr(info.HbmColor))
	dc, _, _ := procGetDC.Call(0)
	defer procReleaseDC.Call(0, dc)
	colorBits, ok := dibits(dc, info.HbmColor, size)
	if !ok {
		return nil, ports.ErrNotFound
	}
	alpha := false
	for i := 3; i < len(colorBits); i += 4 {
		if colorBits[i] != 0 {
			alpha = true
			break
		}
	}
	var mask []byte
	if !alpha {
		mask, _ = dibits(dc, info.HbmMask, size)
	}
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	for i := 0; i < size*size; i++ {
		b, g, r, a := colorBits[4*i], colorBits[4*i+1], colorBits[4*i+2], colorBits[4*i+3]
		if !alpha {
			a = 255
			// A white mask pixel is transparent in an icon without alpha.
			if mask != nil && mask[4*i] != 0 {
				a = 0
			}
		}
		img.SetNRGBA(i%size, i/size, color.NRGBA{R: r, G: g, B: b, A: a})
	}
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

// dibits reads a bitmap as top-down 32-bit BGRA.
func dibits(dc uintptr, bmp windows.Handle, size int) ([]byte, bool) {
	bi := bitmapInfo{Header: bitmapInfoHeader{Width: int32(size), Height: -int32(size), Planes: 1, BitCount: 32}}
	bi.Header.Size = uint32(unsafe.Sizeof(bi.Header))
	buf := make([]byte, 4*size*size)
	lines, _, _ := procGetDIBits.Call(dc, uintptr(bmp), 0, uintptr(size), uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&bi)), 0)
	return buf, lines != 0
}

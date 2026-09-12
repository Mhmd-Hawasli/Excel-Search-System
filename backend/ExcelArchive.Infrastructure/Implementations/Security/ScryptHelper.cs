using System.Security.Cryptography;
using System.Text;

namespace ExcelArchive.Infrastructure.Implementations.Security;

/// <summary>
/// Pure-managed scrypt (RFC 7914) for V1 password-hash compatibility.
/// V1: scrypt N=16384, r=8, p=1, 16-byte salt, 64-byte key, base64 parts,
/// format scrypt$v1$n=..$r=..$p=..$salt$hash. Password bytes are UTF8 (untrimmed).
/// PBKDF2 path stays for already-created V2 pbkdf2$v1 accounts (dispatch only).
/// </summary>
public static class ScryptHelper
{
    public const int N = 16384;
    public const int R = 8;
    public const int P = 1;
    public const int SaltLength = 16;
    public const int KeyLength = 64;

    public static byte[] DeriveKey(byte[] password, byte[] salt, int n, int r, int p, int dkLen)
    {
        if (n <= 1 || (n & (n - 1)) != 0) throw new ArgumentException("N must be a power of two > 1.", nameof(n));
        int blockSize = 128 * r;
        var b = Rfc2898DeriveBytes.Pbkdf2(password, salt, 1, HashAlgorithmName.SHA256, p * blockSize);
        var xy = new byte[256 * r];
        var v = new byte[128 * r * n];
        for (int i = 0; i < p; i++)
            RoMix(b.AsSpan(i * blockSize, blockSize), v, xy, n, r);
        return Rfc2898DeriveBytes.Pbkdf2(password, b, 1, HashAlgorithmName.SHA256, dkLen);
    }

    private static void RoMix(Span<byte> b, byte[] v, byte[] xy, int n, int r)
    {
        int blockSize = 128 * r;
        b.CopyTo(v.AsSpan(0, blockSize));
        var x = xy.AsSpan(0, blockSize);
        var y = xy.AsSpan(blockSize, blockSize);
        b.CopyTo(x);
        for (int i = 0; i < n; i++)
        {
            x.CopyTo(v.AsSpan(i * blockSize, blockSize));
            BlockMix(x, y, r);
            var tmp = x; var xArr = xy; // swap x/y views
            x = y; y = tmp;
            _ = xArr;
        }
        // After loop x holds the last mixed block; integerify uses it.
        // Re-derive j from x for the second pass per RFC 7914.
        // Note: x/y are spans into xy; track via copies below.
        // To keep it simple, re-run the canonical two-phase form:
        // (first pass above already filled V and mixed; second pass follows)
        // The swap above leaves x pointing at the final block — use it directly.
        for (int i = 0; i < n; i++)
        {
            int j = (int)(BitConverter.ToUInt32(x.Slice((2 * r - 1) * 64, 4)) & (uint)(n - 1));
            Xor(x, v.AsSpan(j * blockSize, blockSize));
            BlockMix(x, y, r);
            var tmp = x; x = y; y = tmp;
        }
        x.CopyTo(b);
    }

    private static void Xor(Span<byte> a, ReadOnlySpan<byte> b)
    {
        for (int i = 0; i < a.Length; i++) a[i] ^= b[i];
    }

    private static void BlockMix(ReadOnlySpan<byte> input, Span<byte> output, int r)
    {
        Span<byte> x = stackalloc byte[64];
        input.Slice((2 * r - 1) * 64, 64).CopyTo(x);
        Span<byte> t = stackalloc byte[64];
        for (int i = 0; i < 2 * r; i++)
        {
            for (int k = 0; k < 64; k++) t[k] = (byte)(x[k] ^ input.Slice(i * 64, 64)[k]);
            Salsa208(t, x);
            // Even blocks go to low half, odd blocks to high half.
            var dest = (i % 2 == 0)
                ? output.Slice((i / 2) * 64, 64)
                : output.Slice((r + i / 2) * 64, 64);
            x.CopyTo(dest);
        }
    }

    private static void Salsa208(Span<byte> input, Span<byte> output)
    {
        Span<uint> x = stackalloc uint[16];
        for (int i = 0; i < 16; i++)
            x[i] = BitConverter.ToUInt32(input.Slice(i * 4, 4));
        Span<uint> z = stackalloc uint[16];
        x.CopyTo(z);
        for (int round = 0; round < 4; round++)
        {
            // Column rounds then row rounds (8 rounds total).
            R(ref z[4], z[0], z[12], 7); R(ref z[8], z[4], z[0], 9);
            R(ref z[12], z[8], z[4], 13); R(ref z[0], z[12], z[8], 18);
            R(ref z[9], z[5], z[1], 7); R(ref z[13], z[9], z[5], 9);
            R(ref z[1], z[13], z[9], 13); R(ref z[5], z[1], z[13], 18);
            R(ref z[14], z[10], z[6], 7); R(ref z[2], z[14], z[10], 9);
            R(ref z[6], z[2], z[14], 13); R(ref z[10], z[6], z[2], 18);
            R(ref z[3], z[15], z[11], 7); R(ref z[7], z[3], z[15], 9);
            R(ref z[11], z[7], z[3], 13); R(ref z[15], z[11], z[7], 18);
            R(ref z[1], z[0], z[3], 7); R(ref z[2], z[1], z[0], 9);
            R(ref z[3], z[2], z[1], 13); R(ref z[0], z[3], z[2], 18);
            R(ref z[6], z[5], z[4], 7); R(ref z[7], z[6], z[5], 9);
            R(ref z[4], z[7], z[6], 13); R(ref z[5], z[4], z[7], 18);
            R(ref z[11], z[10], z[9], 7); R(ref z[8], z[11], z[10], 9);
            R(ref z[9], z[8], z[11], 13); R(ref z[10], z[9], z[8], 18);
            R(ref z[12], z[15], z[14], 7); R(ref z[13], z[12], z[15], 9);
            R(ref z[14], z[13], z[12], 13); R(ref z[15], z[14], z[13], 18);
        }
        for (int i = 0; i < 16; i++)
        {
            uint v = z[i] + x[i];
            BitConverter.TryWriteBytes(output.Slice(i * 4, 4), v);
        }

        static void R(ref uint a, uint b, uint c, int s) => a ^= RotateLeft(b + c, s);
        static uint RotateLeft(uint v, int s) => (v << s) | (v >> (32 - s));
    }

    public static bool TryDecodeV1(string stored, out byte[] salt, out byte[] hash)
    {
        salt = []; hash = [];
        var parts = stored.Split('$');
        if (parts.Length != 7 || parts[0] != "scrypt" || parts[1] != "v1") return false;
        if (parts[2] != $"n={N}" || parts[3] != $"r={R}" || parts[4] != $"p={P}") return false;
        try
        {
            salt = Convert.FromBase64String(parts[5]);
            hash = Convert.FromBase64String(parts[6]);
            return salt.Length == SaltLength && hash.Length == KeyLength;
        }
        catch { return false; }
    }

    public static string EncodeV1(byte[] salt, byte[] hash)
        => $"scrypt$v1$n={N}$r={R}$p={P}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";

    public static byte[] HashUtf8(string password, byte[] salt)
        => DeriveKey(Encoding.UTF8.GetBytes(password), salt, N, R, P, KeyLength);
}

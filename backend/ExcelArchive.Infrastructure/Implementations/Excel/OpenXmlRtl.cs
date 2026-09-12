using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;

namespace ExcelArchive.Infrastructure.Implementations.Excel;

/// <summary>
/// Applies right-to-left sheet views to an XLSX buffer. The buffer is first
/// copied into an expandable stream: opening OpenXML directly over the
/// fixed-size array (new MemoryStream(bytes, writable: true)) throws
/// NotSupportedException ("Memory stream is not expandable") on any export
/// large enough to grow while saving.
/// </summary>
public static class OpenXmlRtl
{
    public static byte[] ApplyRightToLeft(byte[] xlsx, IEnumerable<string> sheetNames)
    {
        using var stream = new MemoryStream();
        stream.Write(xlsx, 0, xlsx.Length);
        stream.Position = 0;
        using (var doc = SpreadsheetDocument.Open(stream, true))
        {
            var workbookPart = doc.WorkbookPart!;
            foreach (var name in sheetNames)
            {
                var sheet = workbookPart.Workbook.Sheets!.Elements<Sheet>()
                    .FirstOrDefault(s => s.Name == name);
                if (sheet?.Id is null) continue;
                var part = (WorksheetPart)workbookPart.GetPartById(sheet.Id!);
                var views = part.Worksheet.GetFirstChild<SheetViews>()
                    ?? part.Worksheet.AppendChild(new SheetViews());
                var view = views.GetFirstChild<SheetView>() ?? views.AppendChild(new SheetView());
                view.RightToLeft = true;
                part.Worksheet.Save();
            }
        }
        return stream.ToArray();
    }
}
